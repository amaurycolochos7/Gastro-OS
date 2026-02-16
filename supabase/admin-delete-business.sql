-- =============================================
-- GastroOS — Admin: Delete/Block Business
-- Soft-delete con seguridad endurecida
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================

-- =============================================
-- 1. SCHEMA CHANGES
-- =============================================

-- 1a) Agregar deleted_at a businesses (soft-delete marker)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN businesses.deleted_at IS 'Soft-delete: si no es NULL, el negocio está eliminado';

-- 1b) Agregar disabled_reason a business_memberships
-- Para rastrear POR QUÉ fue desactivada (admin manual vs business_deleted)
ALTER TABLE business_memberships
  ADD COLUMN IF NOT EXISTS disabled_reason text;

COMMENT ON COLUMN business_memberships.disabled_reason IS 'Razón de desactivación: business_deleted, admin, etc.';

-- 1c) Expandir audit_logs entity constraint → agregar 'business'
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_check
  CHECK (entity IN ('order', 'payment', 'cash_register', 'cash_movement', 'inventory', 'product', 'subscription', 'business'));

-- =============================================
-- 2. RLS HARDENING — Bloquear acceso a negocios eliminados
-- =============================================
-- Reemplazar TODAS las policies tenant_isolation para incluir:
--   AND b.deleted_at IS NULL
-- Esto evita bypass vía Supabase client directo.

-- Helper: crear función reutilizable para "membresías válidas en negocio activo"
CREATE OR REPLACE FUNCTION active_business_ids_for_user()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT bm.business_id
  FROM business_memberships bm
  JOIN businesses b ON b.id = bm.business_id
  WHERE bm.user_id = auth.uid()
    AND b.deleted_at IS NULL;
$$;

-- 2a) businesses
DROP POLICY IF EXISTS "tenant_isolation" ON businesses;
CREATE POLICY "tenant_isolation" ON businesses
  FOR ALL USING (
    id IN (SELECT active_business_ids_for_user())
  );

-- 2b) categories
DROP POLICY IF EXISTS "tenant_isolation" ON categories;
CREATE POLICY "tenant_isolation" ON categories
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2c) products
DROP POLICY IF EXISTS "tenant_isolation" ON products;
CREATE POLICY "tenant_isolation" ON products
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2d) inventory_items
DROP POLICY IF EXISTS "tenant_isolation" ON inventory_items;
CREATE POLICY "tenant_isolation" ON inventory_items
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2e) cash_registers
DROP POLICY IF EXISTS "tenant_isolation" ON cash_registers;
CREATE POLICY "tenant_isolation" ON cash_registers
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2f) orders
DROP POLICY IF EXISTS "tenant_isolation" ON orders;
CREATE POLICY "tenant_isolation" ON orders
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2g) order_items
DROP POLICY IF EXISTS "tenant_isolation" ON order_items;
CREATE POLICY "tenant_isolation" ON order_items
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2h) payments
DROP POLICY IF EXISTS "tenant_isolation" ON payments;
CREATE POLICY "tenant_isolation" ON payments
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2i) cash_movements
DROP POLICY IF EXISTS "tenant_isolation" ON cash_movements;
CREATE POLICY "tenant_isolation" ON cash_movements
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2j) inventory_movements
DROP POLICY IF EXISTS "tenant_isolation" ON inventory_movements;
CREATE POLICY "tenant_isolation" ON inventory_movements
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2k) expenses
DROP POLICY IF EXISTS "tenant_isolation" ON expenses;
CREATE POLICY "tenant_isolation" ON expenses
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- 2l) audit_logs
DROP POLICY IF EXISTS "tenant_isolation" ON audit_logs;
CREATE POLICY "tenant_isolation" ON audit_logs
  FOR ALL USING (
    business_id IN (SELECT active_business_ids_for_user())
  );

-- Mantener policies de INSERT (crear negocio/membresía)
-- Estas no necesitan cambio porque son para onboarding nuevo.

-- =============================================
-- 3. RPC: admin_delete_business
-- Transaccional, con FOR UPDATE lock, nota obligatoria
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
BEGIN
  -- 0. Verificar admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  -- 1. Nota obligatoria
  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo de eliminación requerido');
  END IF;

  -- 2. Lock y obtener negocio (FOR UPDATE evita race conditions)
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

  -- 4. Desactivar TODAS las membresías activas (con razón rastreable)
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

  -- 6. Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'delete_business', 'business', p_business_id,
    jsonb_build_object(
      'business_name', v_biz.name,
      'members_disabled', v_members_affected,
      'previous_sub_status', v_old_sub_status,
      'notes', trim(p_notes)
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Negocio "%s" eliminado. %s usuarios desactivados.', v_biz.name, v_members_affected),
    'members_affected', v_members_affected
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_business TO authenticated;

-- =============================================
-- 4. RPC: admin_restore_business
-- Solo reactiva membresías desactivadas por delete
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

  -- 2. Restaurar negocio (quitar deleted_at)
  UPDATE businesses
  SET deleted_at = NULL
  WHERE id = p_business_id;

  -- 3. Reactivar SOLO membresías desactivadas por delete
  UPDATE business_memberships
  SET status = 'active',
      disabled_reason = NULL
  WHERE business_id = p_business_id
    AND status = 'disabled'
    AND disabled_reason = 'business_deleted';

  GET DIAGNOSTICS v_members_restored = ROW_COUNT;

  -- 4. Restaurar suscripción según fechas (misma lógica que unsuspend)
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

  -- 5. Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'restore_business', 'business', p_business_id,
    jsonb_build_object(
      'business_name', v_biz.name,
      'members_restored', v_members_restored,
      'restored_sub_status', v_new_status,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Negocio "%s" restaurado. %s usuarios reactivados. Suscripción: %s',
      v_biz.name, v_members_restored, COALESCE(v_new_status, 'sin suscripción')),
    'members_restored', v_members_restored,
    'sub_status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_restore_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_restore_business TO authenticated;

-- =============================================
-- 5. UPDATE: admin_list_businesses con p_include_deleted
-- Un solo RPC parametrizado en vez de dos
-- =============================================

-- Eliminar firma vieja sin parámetros (evita ambigüedad 42725)
DROP FUNCTION IF EXISTS admin_list_businesses();

CREATE OR REPLACE FUNCTION admin_list_businesses(p_include_deleted boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Mexico_City');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No autorizado');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'businesses', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT
          b.id,
          b.name,
          b.type,
          b.created_at,
          b.deleted_at,
          b.limits_products,
          b.limits_orders_day,
          b.limits_users,
          -- Owner info
          (SELECT au.email FROM auth.users au
           JOIN business_memberships bm ON bm.user_id = au.id
           WHERE bm.business_id = b.id AND bm.role = 'OWNER'
           LIMIT 1) as owner_email,
          -- Subscription info
          s.status as sub_status,
          s.plan_code_snapshot as plan_code,
          s.price_snapshot as plan_price,
          s.billing_interval,
          s.trial_end,
          s.current_period_end,
          s.assigned_by IS NOT NULL as admin_assigned,
          -- Metrics
          (SELECT count(*) FROM products WHERE business_id = b.id AND deleted_at IS NULL AND active = true) as usage_products,
          (SELECT count(*) FROM orders WHERE business_id = b.id AND created_at >= v_today AND status != 'CANCELLED') as usage_orders_day,
          (SELECT count(*) FROM business_memberships WHERE business_id = b.id AND status = 'active') as usage_users,
          -- Last Activity
          GREATEST(
            b.created_at,
            (SELECT max(created_at) FROM orders WHERE business_id = b.id),
            s.updated_at
          ) as last_activity
        FROM businesses b
        LEFT JOIN subscriptions s ON s.business_id = b.id
        WHERE (p_include_deleted OR b.deleted_at IS NULL)
        ORDER BY b.created_at DESC
      ) t
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_list_businesses TO authenticated;

-- =============================================
-- 6. Agregar acciones al ACTION_LABELS (referencia para frontend)
-- delete_business → 'Negocio eliminado'
-- restore_business → 'Negocio restaurado'
-- =============================================

-- =============================================
-- 7. VERIFICACIÓN
-- =============================================

-- Columnas agregadas
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'businesses' AND column_name = 'deleted_at';

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'business_memberships' AND column_name = 'disabled_reason';

-- Constraint actualizado
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname = 'audit_logs_entity_check';

-- RPCs existen
SELECT proname FROM pg_proc
WHERE proname IN ('admin_delete_business', 'admin_restore_business', 'active_business_ids_for_user');

-- Policies actualizadas
SELECT tablename, policyname FROM pg_policies
WHERE policyname = 'tenant_isolation'
ORDER BY tablename;
