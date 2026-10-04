-- =============================================
-- GastroOS — Admin: Business Detail RPC
-- Devuelve detalle completo de un negocio para el drawer admin.
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================

CREATE OR REPLACE FUNCTION admin_get_business_detail(p_business_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_biz record;
  v_sub record;
BEGIN
  v_admin_id := auth.uid();

  -- 0. Verificar admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No autorizado');
  END IF;

  -- 1. Datos del negocio
  SELECT id, name, type, operation_mode, created_at,
         limits_products, limits_orders_day, limits_users, limits_storage_mb,
         default_keep_float_amount, cash_difference_threshold
  INTO v_biz FROM businesses WHERE id = p_business_id;

  IF v_biz IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Negocio no encontrado');
  END IF;

  -- 2. Suscripción
  SELECT s.id, s.status, s.plan_code_snapshot, s.price_snapshot,
         s.billing_interval, s.trial_end, s.current_period_start,
         s.current_period_end, s.notes, s.created_at, s.updated_at,
         s.assigned_by IS NOT NULL as admin_assigned,
         p.name as plan_name
  INTO v_sub FROM subscriptions s
  LEFT JOIN plans p ON p.slug = s.plan_code_snapshot
  WHERE s.business_id = p_business_id;

  RETURN jsonb_build_object(
    'success', true,
    'business', jsonb_build_object(
      'id', v_biz.id,
      'name', v_biz.name,
      'type', v_biz.type,
      'operation_mode', v_biz.operation_mode,
      'created_at', v_biz.created_at,
      'limits_products', v_biz.limits_products,
      'limits_orders_day', v_biz.limits_orders_day,
      'limits_users', v_biz.limits_users,
      'limits_storage_mb', v_biz.limits_storage_mb,
      'default_keep_float_amount', v_biz.default_keep_float_amount,
      'cash_difference_threshold', v_biz.cash_difference_threshold
    ),
    'subscription', CASE WHEN v_sub IS NOT NULL THEN jsonb_build_object(
      'id', v_sub.id,
      'status', v_sub.status,
      'plan_code', v_sub.plan_code_snapshot,
      'plan_name', v_sub.plan_name,
      'price', v_sub.price_snapshot,
      'billing_interval', v_sub.billing_interval,
      'trial_end', v_sub.trial_end,
      'period_start', v_sub.current_period_start,
      'period_end', v_sub.current_period_end,
      'notes', v_sub.notes,
      'admin_assigned', v_sub.admin_assigned,
      'created_at', v_sub.created_at,
      'updated_at', v_sub.updated_at
    ) ELSE NULL END,
    'owner', (
      SELECT jsonb_build_object('email', au.email, 'user_id', au.id)
      FROM auth.users au
      JOIN business_memberships bm ON bm.user_id = au.id
      WHERE bm.business_id = p_business_id AND bm.role = 'OWNER'
      LIMIT 1
    ),
    'members_count', (
      SELECT count(*) FROM business_memberships WHERE business_id = p_business_id
    ),
    'audit_logs', (
      SELECT coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
      FROM (
        SELECT al.action, al.entity, al.entity_id, al.metadata, al.created_at,
               au.email as actor_email
        FROM audit_logs al
        LEFT JOIN auth.users au ON au.id = al.actor_user_id
        WHERE al.business_id = p_business_id
        ORDER BY al.created_at DESC
        LIMIT 20
      ) a
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_get_business_detail FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_business_detail TO authenticated;
