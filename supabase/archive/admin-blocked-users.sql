-- =============================================
-- GastroOS — Tabla: blocked_users + Actualización de RPCs
-- Sistema de bloqueo a nivel usuario (source of truth)
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================

-- =============================================
-- 1. TABLA: blocked_users
-- =============================================

CREATE TABLE IF NOT EXISTS blocked_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  blocked_by uuid REFERENCES auth.users(id),
  business_id uuid REFERENCES businesses(id),  -- Para saber de qué negocio viene el bloqueo
  notes text
);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Nadie puede leer esta tabla desde cliente (solo admin vía RPC SECURITY DEFINER)
REVOKE ALL ON blocked_users FROM authenticated;

COMMENT ON TABLE blocked_users IS 'Usuarios bloqueados: source of truth para denegar acceso al sistema';
COMMENT ON COLUMN blocked_users.business_id IS 'Negocio asociado al bloqueo (para desbloquear al restaurar negocio)';

-- =============================================
-- 2. HELPER RPC: is_user_blocked
-- =============================================

CREATE OR REPLACE FUNCTION is_user_blocked()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_users WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION is_user_blocked FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_user_blocked TO authenticated;

-- =============================================
-- 3. ACTUALIZAR: admin_delete_business
-- Agregar inserción en blocked_users
-- =============================================

CREATE OR REPLACE FUNCTION admin_delete_business(
  p_business_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_biz record;
  v_members_affected integer;
  v_sub_id uuid;
  v_old_sub_status text;
  v_blocked_count integer;
BEGIN
  -- 0. Verificar admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  -- 1. Nota obligatoria
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo de eliminación requerido');
  END IF;

  -- 2. Lock y obtener negocio
  SELECT id, name, deleted_at
  INTO v_biz
  FROM businesses
  WHERE id = p_business_id
  FOR UPDATE;

  IF v_biz IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio no encontrado');
  END IF;

  IF v_biz.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio ya está eliminado');
  END IF;

  -- 3. Soft-delete del negocio
  UPDATE businesses
  SET deleted_at = now()
  WHERE id = p_business_id;

  -- 4. Desactivar TODAS las membresías activas
  UPDATE business_memberships
  SET status = 'disabled',
      disabled_reason = 'business_deleted'
  WHERE business_id = p_business_id
    AND status = 'active';

  GET DIAGNOSTICS v_members_affected = ROW_COUNT;

  -- 5. Cancelar suscripción
  SELECT id, status INTO v_sub_id, v_old_sub_status
  FROM subscriptions
  WHERE business_id = p_business_id;

  IF v_sub_id IS NOT NULL THEN
    UPDATE subscriptions
    SET status = 'canceled',
        notes = 'Negocio eliminado por admin: ' || trim(p_notes),
        updated_at = now()
    WHERE id = v_sub_id;
  END IF;

  -- 6. Bloquear usuarios en blocked_users (ON CONFLICT para idempotencia)
  INSERT INTO blocked_users (user_id, reason, blocked_by, business_id, notes)
  SELECT bm.user_id,
         'business_deleted',
         v_admin_id,
         p_business_id,
         trim(p_notes)
  FROM business_memberships bm
  WHERE bm.business_id = p_business_id
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_blocked_count = ROW_COUNT;

  -- 7. Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'delete_business', 'business', p_business_id,
    jsonb_build_object(
      'business_name', v_biz.name,
      'members_disabled', v_members_affected,
      'users_blocked', v_blocked_count,
      'previous_sub_status', v_old_sub_status,
      'notes', trim(p_notes)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Negocio "%s" eliminado. %s usuarios bloqueados.', v_biz.name, v_blocked_count),
    'members_affected', v_members_affected,
    'users_blocked', v_blocked_count
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_business TO authenticated;

-- =============================================
-- 4. ACTUALIZAR: admin_restore_business
-- Agregar eliminación de blocked_users
-- =============================================

CREATE OR REPLACE FUNCTION admin_restore_business(
  p_business_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_biz record;
  v_members_restored integer;
  v_unblocked_count integer;
  v_sub record;
  v_new_status text;
BEGIN
  -- 0. Verificar admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  -- 1. Lock y obtener negocio
  SELECT id, name, deleted_at
  INTO v_biz
  FROM businesses
  WHERE id = p_business_id
  FOR UPDATE;

  IF v_biz IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio no encontrado');
  END IF;

  IF v_biz.deleted_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio no está eliminado');
  END IF;

  -- 2. Restaurar negocio
  UPDATE businesses
  SET deleted_at = NULL
  WHERE id = p_business_id;

  -- 3. Reactivar membresías desactivadas por delete
  UPDATE business_memberships
  SET status = 'active',
      disabled_reason = NULL
  WHERE business_id = p_business_id
    AND status = 'disabled'
    AND disabled_reason = 'business_deleted';

  GET DIAGNOSTICS v_members_restored = ROW_COUNT;

  -- 4. Desbloquear usuarios (solo los bloqueados por este negocio)
  DELETE FROM blocked_users
  WHERE business_id = p_business_id
    AND reason = 'business_deleted';

  GET DIAGNOSTICS v_unblocked_count = ROW_COUNT;

  -- 5. Restaurar suscripción según fechas
  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF v_sub IS NOT NULL THEN
    IF v_sub.trial_end IS NOT NULL AND v_sub.trial_end > now() THEN
      v_new_status := 'trialing';
    ELSIF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now() THEN
      v_new_status := 'active';
    ELSE
      v_new_status := 'expired';
    END IF;

    UPDATE subscriptions
    SET status = v_new_status,
        notes = COALESCE(p_notes, notes),
        updated_at = now()
    WHERE business_id = p_business_id;
  END IF;

  -- 6. Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'restore_business', 'business', p_business_id,
    jsonb_build_object(
      'business_name', v_biz.name,
      'members_restored', v_members_restored,
      'users_unblocked', v_unblocked_count,
      'restored_sub_status', v_new_status,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Negocio "%s" restaurado. %s usuarios desbloqueados. Suscripción: %s',
      v_biz.name, v_unblocked_count, COALESCE(v_new_status, 'sin suscripción')),
    'members_restored', v_members_restored,
    'users_unblocked', v_unblocked_count,
    'sub_status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_restore_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_restore_business TO authenticated;

-- =============================================
-- 5. ACTUALIZAR: create_business_and_owner_membership
-- Bloquear usuarios en blocked_users
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
  v_demo_plan_id uuid;
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

  -- 0b. Verificar si el usuario está bloqueado
  IF EXISTS (SELECT 1 FROM blocked_users WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'ACCOUNT_BLOCKED',
      'message', 'Tu cuenta fue bloqueada. Contacta soporte.'
    );
  END IF;

  -- 1. Validar que no tenga ya una membresía OWNER activa
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

  -- 3. Obtener plan demo
  SELECT id INTO v_demo_plan_id FROM plans WHERE slug = 'demo' AND active = true;
  IF v_demo_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'UNKNOWN',
      'message', 'Plan demo no encontrado. Contacta soporte.'
    );
  END IF;

  -- 4. Crear negocio
  INSERT INTO businesses (name, type, operation_mode)
  VALUES (trim(p_name), p_type, p_operation_mode)
  RETURNING id INTO v_business_id;

  -- 5. Crear membresía OWNER
  INSERT INTO business_memberships (business_id, user_id, role, status)
  VALUES (v_business_id, v_user_id, 'OWNER', 'active');

  -- 6. Inicializar secuencia de folios
  INSERT INTO folio_sequences (business_id, last_folio)
  VALUES (v_business_id, 0)
  ON CONFLICT (business_id) DO NOTHING;

  -- 7. Crear subscription trial automática (5 días)
  INSERT INTO subscriptions (
    business_id, plan_id, status,
    current_period_start, current_period_end, trial_end,
    plan_code_snapshot, price_snapshot, currency, billing_interval,
    created_by
  ) VALUES (
    v_business_id, v_demo_plan_id, 'trialing',
    now(), now() + interval '5 days', now() + interval '5 days',
    'demo', 0, 'MXN', 'trial',
    v_user_id
  );

  -- 8. Retornar resultado exitoso
  RETURN jsonb_build_object(
    'success', true,
    'code', 'CREATED',
    'message', 'Negocio creado con prueba gratuita de 5 días',
    'business_id', v_business_id,
    'business_name', trim(p_name)
  );

EXCEPTION
  WHEN unique_violation THEN
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

REVOKE ALL ON FUNCTION create_business_and_owner_membership FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_business_and_owner_membership TO authenticated;

-- =============================================
-- 6. VERIFICACIÓN
-- =============================================

-- Tabla existe
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'blocked_users'
ORDER BY ordinal_position;

-- RPC existe
SELECT proname FROM pg_proc
WHERE proname IN ('is_user_blocked', 'admin_delete_business', 'admin_restore_business', 'create_business_and_owner_membership');

-- RLS activo
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'blocked_users';
