-- =============================================
-- Admin Activity Tracking — Heartbeat System
-- Corrige last_activity y agrega estado "En línea"
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================

-- =============================================
-- 1. SCHEMA: Agregar last_active_at a business_memberships
-- =============================================

ALTER TABLE business_memberships
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

COMMENT ON COLUMN business_memberships.last_active_at
  IS 'Última actividad del usuario — actualizado por heartbeat cada 60s';

-- Índice para querying rápido de la actividad más reciente por negocio
CREATE INDEX IF NOT EXISTS idx_bm_last_active
  ON business_memberships(business_id, last_active_at DESC NULLS LAST);

-- =============================================
-- 2. RPC: heartbeat() — llamado cada 60s desde el frontend
-- =============================================

CREATE OR REPLACE FUNCTION heartbeat()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE business_memberships
  SET last_active_at = now()
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;

REVOKE ALL ON FUNCTION heartbeat FROM PUBLIC;
GRANT EXECUTE ON FUNCTION heartbeat TO authenticated;

-- =============================================
-- 3. UPDATE: admin_list_businesses — usar last_active_at
-- =============================================

-- Drop firma sin parámetros si existe (evitar ambigüedad)
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
          -- Last Activity (CORREGIDO: usa heartbeat de miembros, no subscription updated_at)
          GREATEST(
            b.created_at,
            (SELECT max(created_at) FROM orders WHERE business_id = b.id),
            (SELECT max(last_active_at) FROM business_memberships WHERE business_id = b.id)
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
-- 4. VERIFICACIÓN
-- =============================================

-- Columna agregada
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'business_memberships' AND column_name = 'last_active_at';

-- RPC heartbeat existe
SELECT proname FROM pg_proc WHERE proname = 'heartbeat';

-- Confirmar que admin_list_businesses ya no usa s.updated_at
SELECT prosrc FROM pg_proc WHERE proname = 'admin_list_businesses';
