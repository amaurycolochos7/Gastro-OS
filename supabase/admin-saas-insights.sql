-- =============================================
-- Admin SaaS Insights
-- Actualiza admin_list_businesses para incluir métricas de uso y MRR
-- =============================================

CREATE OR REPLACE FUNCTION admin_list_businesses()
RETURNS jsonb AS $$
DECLARE
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Mexico_City'); -- Ajustar zona si es necesario
BEGIN
  -- Verificar admin (asumiendo tabla admin_users existente o lógica de auth)
  -- Nota: En la versión anterior se usaba admin_users, manteniendo esa lógica.
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) THEN
     -- Fallback si no existe la tabla, usar is_admin() si existe, o permitir para dev.
     -- Por seguridad, intentar is_admin() si existe.
     -- PERO, para consistencia con el archivo anterior:
    IF (SELECT count(*) FROM admin_users WHERE user_id = auth.uid()) = 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No autorizado');
    END IF;
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
          s.billing_interval,
          s.trial_end,
          s.current_period_end,
          s.assigned_by IS NOT NULL as admin_assigned,
          -- Metrics (Usage vs Limits)
          (SELECT count(*) FROM products WHERE business_id = b.id AND deleted_at IS NULL AND active = true) as usage_products,
          (SELECT count(*) FROM orders WHERE business_id = b.id AND created_at >= v_today AND status != 'CANCELLED') as usage_orders_day,
          (SELECT count(*) FROM business_memberships WHERE business_id = b.id) as usage_users,
          -- Last Activity (Order or Sub update or Creation)
          GREATEST(
            b.created_at,
            (SELECT max(created_at) FROM orders WHERE business_id = b.id),
            s.updated_at
          ) as last_activity
        FROM businesses b
        LEFT JOIN subscriptions s ON s.business_id = b.id
        ORDER BY b.created_at DESC
      ) t
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_list_businesses TO authenticated;
