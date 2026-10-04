-- =============================================
-- GastroOS - Fase SaaS-1: Onboarding RPC Transaccional
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================
-- Objetivo: reemplazar inserts directos desde frontend por una
-- única RPC atómica que crea negocio + membresía OWNER.

-- =============================================
-- 0. UNIQUE INDEX: 1 OWNER activo por usuario (race-condition safe)
-- =============================================
-- Si 2 pestañas hacen onboarding al mismo tiempo, el índice garantiza
-- que solo 1 gane. El otro recibe constraint violation.

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_owner_per_user
  ON business_memberships(user_id)
  WHERE role = 'OWNER' AND status = 'active';

-- =============================================
-- 1. CREAR RPC TRANSACCIONAL
-- =============================================

CREATE OR REPLACE FUNCTION create_business_and_owner_membership(
  p_name text,
  p_type text,
  p_operation_mode text
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_business_id uuid;
BEGIN
  -- 0. Obtener usuario autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'AUTH_ERROR',
      'message', 'No autenticado'
    );
  END IF;

  -- 1. Validar que no tenga ya una membresía OWNER activa
  --    (bloquea duplicados en onboarding, pero no afecta invitaciones como ADMIN/CASHIER/etc.)
  IF EXISTS (
    SELECT 1 FROM business_memberships
    WHERE user_id = v_user_id
      AND role = 'OWNER'
      AND status = 'active'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_HAS_BUSINESS',
      'message', 'Ya tienes un negocio registrado'
    );
  END IF;

  -- 2. Validar inputs
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'message', 'El nombre del negocio es requerido'
    );
  END IF;

  IF p_type NOT IN ('taqueria', 'pizzeria', 'cafeteria', 'fast_food', 'other') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'message', 'Tipo de negocio no válido: ' || coalesce(p_type, 'null')
    );
  END IF;

  IF p_operation_mode NOT IN ('counter', 'restaurant') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'VALIDATION_ERROR',
      'message', 'Modo de operación no válido: ' || coalesce(p_operation_mode, 'null')
    );
  END IF;

  -- 3. Crear negocio
  INSERT INTO businesses (name, type, operation_mode)
  VALUES (trim(p_name), p_type, p_operation_mode)
  RETURNING id INTO v_business_id;

  -- 4. Crear membresía OWNER
  --    El unique index idx_one_active_owner_per_user protege contra race conditions.
  --    Si 2 pestañas llegan aquí al mismo tiempo, solo 1 ganará el INSERT.
  INSERT INTO business_memberships (business_id, user_id, role, status)
  VALUES (v_business_id, v_user_id, 'OWNER', 'active');

  -- 5. Inicializar secuencia de folios (idempotente)
  INSERT INTO folio_sequences (business_id, last_folio)
  VALUES (v_business_id, 0)
  ON CONFLICT (business_id) DO NOTHING;

  -- 6. Retornar resultado exitoso
  RETURN jsonb_build_object(
    'success', true,
    'code', 'CREATED',
    'message', 'Negocio creado exitosamente',
    'business_id', v_business_id,
    'business_name', trim(p_name)
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Race condition: el unique index atrapó un duplicado
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ALREADY_HAS_BUSINESS',
      'message', 'Ya tienes un negocio registrado (intento duplicado)'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'UNKNOWN',
      'message', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permisos: solo usuarios autenticados pueden llamar esta función
REVOKE ALL ON FUNCTION create_business_and_owner_membership FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_business_and_owner_membership TO authenticated;

-- =============================================
-- 2. CERRAR POLICIES DE INSERT DIRECTO (quirúrgico)
-- =============================================
-- Estrategia: DROP las policies permisivas existentes, luego crear
-- policies explícitas de DENY (WITH CHECK (false)) para que nadie
-- pueda hacer INSERT directo desde el frontend.
-- La RPC usa SECURITY DEFINER, así que bypasea RLS completamente.

-- ── Businesses: bloquear INSERT directo ──

DROP POLICY IF EXISTS "users_can_create_business" ON businesses;
DROP POLICY IF EXISTS "businesses_insert_authenticated" ON businesses;
DROP POLICY IF EXISTS "businesses_insert" ON businesses;

CREATE POLICY "businesses_insert_denied" ON businesses
  FOR INSERT WITH CHECK (false);

-- ── Business Memberships: bloquear INSERT directo ──
-- No hay invite flow todavía, así que deny total.
-- Cuando se implemente invite_member RPC, se creará policy específica.

DROP POLICY IF EXISTS "memberships_insert" ON business_memberships;
DROP POLICY IF EXISTS "memberships_insert_owner_only" ON business_memberships;
DROP POLICY IF EXISTS "users_can_create_membership" ON business_memberships;

CREATE POLICY "memberships_insert_denied" ON business_memberships
  FOR INSERT WITH CHECK (false);

-- =============================================
-- 3. VERIFICACIÓN
-- =============================================

-- Verificar unique index
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'business_memberships'
  AND indexname = 'idx_one_active_owner_per_user';

-- Verificar que la función existe
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'create_business_and_owner_membership';

-- Verificar policies en businesses (debe tener businesses_insert_denied)
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'businesses'
ORDER BY cmd;

-- Verificar policies en business_memberships (debe tener memberships_insert_denied)
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'business_memberships'
ORDER BY cmd;
