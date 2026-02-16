-- =============================================
-- GastroOS - Fase SaaS-2: Trial/Demo Automático
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================
-- Prerequisito: Fase SaaS-1 ya ejecutada.

-- =============================================
-- 1. TABLA: plans (seed, read-only)
-- =============================================

CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,       -- 'demo', 'basic', 'premium_monthly', 'premium_annual'
  name text NOT NULL,              -- Nombre para mostrar
  price numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN',
  billing_interval text NOT NULL CHECK (billing_interval IN ('trial', 'monthly', 'annual')),
  features jsonb DEFAULT '{}'::jsonb,  -- límites del plan
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- =============================================
-- 2. SEED: Planes iniciales
-- =============================================

INSERT INTO plans (slug, name, price, currency, billing_interval, features) VALUES
  ('demo', 'Demo (5 días)', 0, 'MXN', 'trial', jsonb_build_object(
    'limits_products', 100,
    'limits_orders_day', 200,
    'limits_users', 3,
    'limits_storage_mb', 50
  )),
  ('basic', 'Básico', 69, 'MXN', 'monthly', jsonb_build_object(
    'limits_products', 10,
    'limits_orders_day', 100,
    'limits_users', 2,
    'limits_storage_mb', 25
  )),
  ('premium_monthly', 'Premium Mensual', 120, 'MXN', 'monthly', jsonb_build_object(
    'limits_products', 500,
    'limits_orders_day', 1000,
    'limits_users', 10,
    'limits_storage_mb', 200
  )),
  ('premium_annual', 'Premium Anual', 1200, 'MXN', 'annual', jsonb_build_object(
    'limits_products', 500,
    'limits_orders_day', 1000,
    'limits_users', 10,
    'limits_storage_mb', 200
  ))
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- 3. TABLA: subscriptions (1 por negocio)
-- =============================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'expired', 'canceled')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  trial_end timestamptz,
  -- Snapshots (congelan precio al momento de crear/cambiar plan)
  plan_code_snapshot text NOT NULL,       -- slug del plan al momento
  price_snapshot numeric(10,2) NOT NULL,  -- precio congelado
  currency text NOT NULL DEFAULT 'MXN',
  billing_interval text NOT NULL,         -- 'trial', 'monthly', 'annual'
  -- Auditoría
  created_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_by uuid REFERENCES auth.users(id),  -- NULL = auto onboarding
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índice: business_id ya es UNIQUE por la constraint del CREATE TABLE.
-- Esto garantiza 1 subscription por negocio. Historial se hará en otra tabla luego.

-- =============================================
-- 4. RLS para plans y subscriptions
-- =============================================

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Plans: cualquier autenticado puede ver (es catálogo público)
DROP POLICY IF EXISTS "plans_select_authenticated" ON plans;
CREATE POLICY "plans_select_authenticated" ON plans
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Plans: nadie inserta/modifica desde frontend
DROP POLICY IF EXISTS "plans_insert_denied" ON plans;
CREATE POLICY "plans_insert_denied" ON plans
  FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "plans_update_denied" ON plans;
CREATE POLICY "plans_update_denied" ON plans
  FOR UPDATE USING (false);
DROP POLICY IF EXISTS "plans_delete_denied" ON plans;
CREATE POLICY "plans_delete_denied" ON plans
  FOR DELETE USING (false);

-- Subscriptions: tenant isolation (solo leer la tuya)
DROP POLICY IF EXISTS "subscriptions_select" ON subscriptions;
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_memberships WHERE user_id = auth.uid()
    )
  );

-- Subscriptions: nadie modifica desde frontend (todo vía RPC o admin)
DROP POLICY IF EXISTS "subscriptions_insert_denied" ON subscriptions;
CREATE POLICY "subscriptions_insert_denied" ON subscriptions
  FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "subscriptions_update_denied" ON subscriptions;
CREATE POLICY "subscriptions_update_denied" ON subscriptions
  FOR UPDATE USING (false);
DROP POLICY IF EXISTS "subscriptions_delete_denied" ON subscriptions;
CREATE POLICY "subscriptions_delete_denied" ON subscriptions
  FOR DELETE USING (false);

-- =============================================
-- 5. EXTENDER RPC: crear trial atómico en onboarding
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

  -- 6. Inicializar secuencia de folios (idempotente)
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

-- Permisos (re-aplicar porque usamos CREATE OR REPLACE)
REVOKE ALL ON FUNCTION create_business_and_owner_membership FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_business_and_owner_membership TO authenticated;

-- =============================================
-- 6. HELPER: has_active_subscription()
-- =============================================
-- Devuelve el estado actual de subscription.
-- Usado por dashboard gate y potencialmente por otros RPCs.

CREATE OR REPLACE FUNCTION get_subscription_status(p_business_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_sub record;
BEGIN
  SELECT
    s.id, s.status, s.trial_end, s.current_period_end,
    s.plan_code_snapshot, s.price_snapshot, s.notes
  INTO v_sub
  FROM subscriptions s
  WHERE s.business_id = p_business_id;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object(
      'has_subscription', false,
      'is_active', false,
      'status', 'none'
    );
  END IF;

  -- Si está en trial y ya venció → marcar como expired
  IF v_sub.status = 'trialing' AND v_sub.trial_end < now() THEN
    UPDATE subscriptions
    SET status = 'expired', updated_at = now()
    WHERE id = v_sub.id;

    RETURN jsonb_build_object(
      'has_subscription', true,
      'is_active', false,
      'status', 'expired',
      'plan_code', v_sub.plan_code_snapshot,
      'trial_end', v_sub.trial_end,
      'notes', v_sub.notes
    );
  END IF;

  -- Determinar si está activo
  RETURN jsonb_build_object(
    'has_subscription', true,
    'is_active', v_sub.status IN ('trialing', 'active'),
    'status', v_sub.status,
    'plan_code', v_sub.plan_code_snapshot,
    'trial_end', v_sub.trial_end,
    'current_period_end', v_sub.current_period_end,
    'notes', v_sub.notes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION get_subscription_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_subscription_status TO authenticated;

-- =============================================
-- 7. TRIGGER: auto-update updated_at en subscriptions
-- =============================================

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- 8. VERIFICACIÓN
-- =============================================

-- Plans seed
SELECT slug, name, price, billing_interval FROM plans ORDER BY price;

-- Subscriptions table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'subscriptions'
ORDER BY ordinal_position;

-- RPC exists
SELECT proname, prosecdef FROM pg_proc
WHERE proname IN ('create_business_and_owner_membership', 'get_subscription_status');

-- Policies
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('plans', 'subscriptions')
ORDER BY tablename, cmd;
