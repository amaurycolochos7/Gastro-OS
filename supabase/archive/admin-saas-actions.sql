-- =============================================
-- Admin SaaS Actions (Enhanced)
-- Acciones típicas de operación SaaS desde panel admin
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- 1. Agregar 'suspended' al CHECK constraint de subscriptions
-- =============================================

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trialing', 'active', 'past_due', 'expired', 'canceled', 'suspended'));

-- 2. Agregar columna para plan programado (cambio al siguiente periodo)
-- =============================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_plan_slug text,
  ADD COLUMN IF NOT EXISTS scheduled_plan_at timestamptz;

COMMENT ON COLUMN subscriptions.scheduled_plan_slug IS 'Plan que se aplicará al final del periodo actual';
COMMENT ON COLUMN subscriptions.scheduled_plan_at IS 'Fecha en que se programó el cambio';

-- =============================================
-- 3. RPC: admin_extend_trial (ENHANCED)
-- Extiende el trial_end y REACTIVA si está canceled/expired
-- =============================================

CREATE OR REPLACE FUNCTION admin_extend_trial(
  p_business_id uuid,
  p_days integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_new_end timestamptz;
  v_admin_id uuid := auth.uid();
  v_action_msg text;
BEGIN
  -- Verificar admin
  -- (Asumimos is_admin() existe, si no, usar check directo a admin_users)
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
     -- Fallback a is_admin si la tabla no existe o user no está
     -- Por ahora retornamos error si no pasa
     RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  -- Validar días
  IF p_days < 1 OR p_days > 60 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Días debe ser entre 1 y 60');
  END IF;

  -- Obtener suscripción
  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio sin suscripción');
  END IF;

  -- Permitir trialing, expired y canceled
  IF v_sub.status NOT IN ('trialing', 'expired', 'canceled') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solo se puede extender trial en status: trialing, expired o canceled');
  END IF;

  -- Calcular nueva fecha y mensaje
  IF v_sub.status IN ('canceled', 'expired') THEN
     -- REACTIVACIÓN: El trial empieza "ahora" + días
     v_new_end := now() + (p_days || ' days')::interval;
     v_action_msg := 'Reactivado y extendido';
     
     -- Resetear periodos para que coincidan con el nuevo trial
     UPDATE subscriptions
     SET trial_end = v_new_end,
         status = 'trialing',
         current_period_start = now(),
         current_period_end = v_new_end, -- El periodo activo es el trial
         notes = COALESCE(p_notes, notes),
         updated_at = now()
     WHERE business_id = p_business_id;

  ELSE
     -- EXTENSIÓN NORMAL (Status ya es trialing)
     -- Sumar días al trial_end existente (o now() si por algun motivo es null/pasado pero status decía trialing)
     v_new_end := GREATEST(COALESCE(v_sub.trial_end, now()), now()) + (p_days || ' days')::interval;
     v_action_msg := 'Extendido';

     UPDATE subscriptions
     SET trial_end = v_new_end,
         status = 'trialing',
         current_period_end = v_new_end, -- Sincronizar periodo con trial
         notes = COALESCE(p_notes, notes),
         updated_at = now()
     WHERE business_id = p_business_id;
  END IF;

  -- Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'extend_trial', 'subscription', v_sub.id,
    jsonb_build_object(
      'days_added', p_days,
      'new_trial_end', v_new_end,
      'old_status', v_sub.status,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('%s %s días (hasta %s)', v_action_msg, p_days, to_char(v_new_end, 'DD Mon YYYY HH24:MI'))
  );
END;
$$;

-- Resto de RPCs (suspend, unsuspend, schedule, cancel, detail) se mantienen igual
-- Re-ejecutar admin-saas-actions.sql completo asegura que todo esté definido.

-- ... (RPC: admin_suspend_business)
CREATE OR REPLACE FUNCTION admin_suspend_business(
  p_business_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_admin_id uuid := auth.uid();
BEGIN
  -- Verificar admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo de suspensión requerido');
  END IF;

  -- Obtener suscripción
  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio sin suscripción');
  END IF;

  IF v_sub.status = 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio ya está suspendido');
  END IF;

  -- Suspender
  UPDATE subscriptions
  SET status = 'suspended',
      notes = p_notes,
      updated_at = now()
  WHERE business_id = p_business_id;

  -- Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'suspend_business', 'subscription', v_sub.id,
    jsonb_build_object(
      'previous_status', v_sub.status,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Negocio suspendido. Estado anterior: %s', v_sub.status)
  );
END;
$$;

-- ... (RPC: admin_unsuspend_business)
CREATE OR REPLACE FUNCTION admin_unsuspend_business(
  p_business_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_admin_id uuid := auth.uid();
  v_new_status text;
BEGIN
  -- Verificar admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  -- Obtener suscripción
  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio sin suscripción');
  END IF;

  IF v_sub.status != 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio no está suspendido');
  END IF;

  -- Determinar estado correcto al reactivar
  IF v_sub.trial_end IS NOT NULL AND v_sub.trial_end > now() THEN
    v_new_status := 'trialing';
  ELSIF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now() THEN
    v_new_status := 'active';
  ELSE
    v_new_status := 'expired';
  END IF;

  -- Reactivar
  UPDATE subscriptions
  SET status = v_new_status,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE business_id = p_business_id;

  -- Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'unsuspend_business', 'subscription', v_sub.id,
    jsonb_build_object(
      'restored_status', v_new_status,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Negocio reactivado con estado: %s', v_new_status)
  );
END;
$$;

-- ... (RPC: admin_schedule_plan_change)
CREATE OR REPLACE FUNCTION admin_schedule_plan_change(
  p_business_id uuid,
  p_plan_slug text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_plan record;
  v_admin_id uuid := auth.uid();
BEGIN
  -- Verificar admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  -- Validar plan
  SELECT * INTO v_plan FROM plans WHERE slug = p_plan_slug AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Plan no encontrado');
  END IF;

  -- Obtener suscripción
  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio sin suscripción');
  END IF;

  IF v_sub.plan_code_snapshot = p_plan_slug THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio ya tiene ese plan');
  END IF;

  -- Programar cambio
  UPDATE subscriptions
  SET scheduled_plan_slug = p_plan_slug,
      scheduled_plan_at = now(),
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE business_id = p_business_id;

  -- Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'schedule_plan_change', 'subscription', v_sub.id,
    jsonb_build_object(
      'current_plan', v_sub.plan_code_snapshot,
      'scheduled_plan', p_plan_slug,
      'effective_after', v_sub.current_period_end,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Cambio a %s programado para fin de periodo (%s)',
      v_plan.name,
      COALESCE(to_char(v_sub.current_period_end, 'DD Mon YYYY'), 'sin fecha'))
  );
END;
$$;

-- ... (RPC: admin_cancel_scheduled_change)
CREATE OR REPLACE FUNCTION admin_cancel_scheduled_change(
  p_business_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_admin_id uuid := auth.uid();
BEGIN
  -- Verificar admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND OR v_sub.scheduled_plan_slug IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No hay cambio programado');
  END IF;

  UPDATE subscriptions
  SET scheduled_plan_slug = NULL,
      scheduled_plan_at = NULL,
      updated_at = now()
  WHERE business_id = p_business_id;

  -- Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'cancel_scheduled_change', 'subscription', v_sub.id,
    jsonb_build_object('canceled_plan', v_sub.scheduled_plan_slug)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Cambio programado a %s cancelado', v_sub.scheduled_plan_slug)
  );
END;
$$;
