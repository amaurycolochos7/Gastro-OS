-- =============================================
-- GastroOS - Fase SaaS-3: Plan → Límites (copy to business)
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================
-- Prerequisito: Fase SaaS-1 + SaaS-2 ya ejecutadas.
-- Los límites ya existen en businesses (Fase 4):
--   limits_products (default 100)
--   limits_orders_day (default 200)
--   limits_users (default 3)
-- Y los triggers ya los enforzan.
-- Solo necesitamos:
--   1. Copiar límites del plan al business en onboarding
--   2. Helper para cambios de plan futuros

-- =============================================
-- 1. HELPER: apply_plan_limits_to_business()
-- =============================================
-- Copia los límites del plan al negocio.
-- Se llama desde la RPC de onboarding y desde futuros cambios de plan.

CREATE OR REPLACE FUNCTION apply_plan_limits_to_business(
  p_business_id uuid,
  p_plan_id uuid
)
RETURNS void AS $$
DECLARE
  v_features jsonb;
BEGIN
  SELECT features INTO v_features FROM plans WHERE id = p_plan_id;

  IF v_features IS NULL THEN
    RAISE EXCEPTION 'Plan no encontrado: %', p_plan_id;
  END IF;

  UPDATE businesses SET
    limits_products   = COALESCE((v_features->>'limits_products')::int, 100),
    limits_orders_day = COALESCE((v_features->>'limits_orders_day')::int, 200),
    limits_users      = COALESCE((v_features->>'limits_users')::int, 3)
  WHERE id = p_business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION apply_plan_limits_to_business FROM PUBLIC;
-- No se expone a authenticated — solo se llama internamente desde otras RPCs.

-- =============================================
-- 2. EXTENDER RPC ONBOARDING: copiar límites del plan demo
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

  -- 8. ★ NUEVO: Copiar límites del plan demo al negocio
  PERFORM apply_plan_limits_to_business(v_business_id, v_demo_plan_id);

  -- 9. Retornar resultado exitoso
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
-- 3. RPC: change_business_plan (para admin/futuro)
-- =============================================
-- Permite cambiar plan y aplicar nuevos límites.
-- Solo callable por OWNER del negocio o admin.

CREATE OR REPLACE FUNCTION change_business_plan(
  p_business_id uuid,
  p_plan_slug text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_plan record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'AUTH_ERROR', 'message', 'No autenticado');
  END IF;

  -- Verificar que es OWNER del negocio
  IF NOT EXISTS (
    SELECT 1 FROM business_memberships
    WHERE business_id = p_business_id AND user_id = v_user_id AND role = 'OWNER'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No eres dueño de este negocio');
  END IF;

  -- Obtener plan nuevo
  SELECT id, slug, price, billing_interval INTO v_plan
  FROM plans
  WHERE slug = p_plan_slug AND active = true;

  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Plan no encontrado: ' || coalesce(p_plan_slug, 'null'));
  END IF;

  -- Actualizar subscription (business_id es UNIQUE, así que siempre es 1 row)
  UPDATE subscriptions SET
    plan_id = v_plan.id,
    status = 'active',
    plan_code_snapshot = v_plan.slug,
    price_snapshot = v_plan.price,
    billing_interval = v_plan.billing_interval,
    current_period_start = now(),
    current_period_end = CASE
      WHEN v_plan.billing_interval = 'monthly' THEN now() + interval '1 month'
      WHEN v_plan.billing_interval = 'annual' THEN now() + interval '1 year'
      ELSE now() + interval '1 month'
    END,
    trial_end = NULL,
    assigned_by = v_user_id,
    notes = p_notes,
    updated_at = now()
  WHERE business_id = p_business_id;

  -- Aplicar nuevos límites al negocio
  PERFORM apply_plan_limits_to_business(p_business_id, v_plan.id);

  RETURN jsonb_build_object(
    'success', true,
    'code', 'PLAN_CHANGED',
    'message', 'Plan actualizado a ' || v_plan.slug,
    'plan_code', v_plan.slug
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION change_business_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_business_plan TO authenticated;

-- =============================================
-- 4. VERIFICACIÓN
-- =============================================

-- Verificar que apply_plan_limits_to_business existe
SELECT proname FROM pg_proc WHERE proname = 'apply_plan_limits_to_business';

-- Verificar que change_business_plan existe
SELECT proname FROM pg_proc WHERE proname = 'change_business_plan';

-- Verificar límites del plan demo
SELECT slug, features->>'limits_products' as products,
       features->>'limits_orders_day' as orders,
       features->>'limits_users' as users
FROM plans;
