-- =============================================
-- GastroOS - Fase SaaS-4: Admin Panel Interno
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================
-- Prerequisito: Fases SaaS 1-3 ejecutadas.

-- =============================================
-- 1. TABLA: admin_users (whitelist)
-- =============================================

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden leer admin_users
CREATE POLICY "admin_users_select" ON admin_users
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- Nadie modifica desde frontend
CREATE POLICY "admin_users_insert_denied" ON admin_users
  FOR INSERT WITH CHECK (false);
CREATE POLICY "admin_users_update_denied" ON admin_users
  FOR UPDATE USING (false);
CREATE POLICY "admin_users_delete_denied" ON admin_users
  FOR DELETE USING (false);

-- =============================================
-- 2. HELPER: is_admin()
-- =============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION is_admin FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin TO authenticated;

-- =============================================
-- 3. Expandir audit_logs entity constraint
-- =============================================
-- Necesitamos agregar 'subscription' como entity válido.

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_entity_check;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_entity_check
  CHECK (entity IN ('order', 'payment', 'cash_register', 'cash_movement', 'inventory', 'product', 'subscription'));

-- =============================================
-- 4. RPC: admin_assign_plan (solo admins)
-- =============================================

CREATE OR REPLACE FUNCTION admin_assign_plan(
  p_business_id uuid,
  p_plan_slug text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_plan record;
  v_sub_id uuid;
  v_period_end timestamptz;
BEGIN
  v_admin_id := auth.uid();

  -- 0. Verificar que es admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No autorizado');
  END IF;

  -- 1. Verificar que el negocio existe
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Negocio no encontrado');
  END IF;

  -- 2. Obtener plan
  SELECT id, slug, name, price, billing_interval INTO v_plan
  FROM plans
  WHERE slug = p_plan_slug AND active = true;

  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Plan no encontrado: ' || coalesce(p_plan_slug, 'null'));
  END IF;

  -- 3. Calcular period_end
  v_period_end := CASE
    WHEN v_plan.billing_interval = 'monthly' THEN now() + interval '1 month'
    WHEN v_plan.billing_interval = 'annual' THEN now() + interval '1 year'
    ELSE now() + interval '1 month'
  END;

  -- 4. Actualizar subscription (business_id es UNIQUE)
  UPDATE subscriptions SET
    plan_id = v_plan.id,
    status = 'active',
    plan_code_snapshot = v_plan.slug,
    price_snapshot = v_plan.price,
    billing_interval = v_plan.billing_interval,
    current_period_start = now(),
    current_period_end = v_period_end,
    trial_end = NULL,
    assigned_by = v_admin_id,
    notes = coalesce(p_notes, 'Asignado por admin'),
    updated_at = now()
  WHERE business_id = p_business_id
  RETURNING id INTO v_sub_id;

  -- Si no tenía subscription (edge case), crear una
  IF v_sub_id IS NULL THEN
    INSERT INTO subscriptions (
      business_id, plan_id, status,
      current_period_start, current_period_end,
      plan_code_snapshot, price_snapshot, currency, billing_interval,
      created_by, assigned_by, notes
    ) VALUES (
      p_business_id, v_plan.id, 'active',
      now(), v_period_end,
      v_plan.slug, v_plan.price, 'MXN', v_plan.billing_interval,
      v_admin_id, v_admin_id, coalesce(p_notes, 'Asignado por admin')
    )
    RETURNING id INTO v_sub_id;
  END IF;

  -- 5. Aplicar límites del plan
  PERFORM apply_plan_limits_to_business(p_business_id, v_plan.id);

  -- 6. Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'admin_assign_plan', 'subscription', v_sub_id,
    jsonb_build_object(
      'plan_slug', v_plan.slug,
      'plan_name', v_plan.name,
      'price', v_plan.price,
      'period_end', v_period_end,
      'notes', p_notes
    )
  );

  -- 7. Retorno
  RETURN jsonb_build_object(
    'success', true,
    'code', 'PLAN_ASSIGNED',
    'message', 'Plan ' || v_plan.name || ' asignado correctamente',
    'plan_slug', v_plan.slug,
    'period_end', v_period_end
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_assign_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_assign_plan TO authenticated;

-- =============================================
-- 5. RPC: admin_list_businesses (solo admins)
-- =============================================
-- Lista todos los negocios con sus subscriptions para el panel admin.

CREATE OR REPLACE FUNCTION admin_list_businesses()
RETURNS jsonb AS $$
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
          s.trial_end,
          s.current_period_end,
          s.assigned_by IS NOT NULL as admin_assigned
        FROM businesses b
        LEFT JOIN subscriptions s ON s.business_id = b.id
        ORDER BY b.created_at DESC
      ) t
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_list_businesses FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_businesses TO authenticated;

-- =============================================
-- 6. SEED: Agregar tu usuario como admin
-- =============================================
-- IMPORTANTE: Reemplaza el email con tu email real.
-- Este INSERT se hace con SECURITY DEFINER o directamente en SQL Editor.

-- INSERT INTO admin_users (user_id, email)
-- SELECT id, email FROM auth.users WHERE email = 'TU_EMAIL_AQUI';

-- =============================================
-- 7. VERIFICACIÓN
-- =============================================

SELECT proname FROM pg_proc
WHERE proname IN ('is_admin', 'admin_assign_plan', 'admin_list_businesses');

SELECT conname, pg_get_constraintdef(oid) as definition FROM pg_constraint
WHERE conname = 'audit_logs_entity_check';

SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename = 'admin_users'
ORDER BY cmd;
