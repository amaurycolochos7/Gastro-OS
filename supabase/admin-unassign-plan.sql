
CREATE OR REPLACE FUNCTION admin_unassign_plan(
  p_business_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_sub record;
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

  -- 2. Obtener subscription actual
  SELECT id, status, plan_code_snapshot INTO v_sub
  FROM subscriptions
  WHERE business_id = p_business_id;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_SUB', 'message', 'El negocio no tiene suscripción');
  END IF;

  IF v_sub.status = 'canceled' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CANCELED', 'message', 'El plan ya está cancelado');
  END IF;

  -- 3. Cancelar subscription
  UPDATE subscriptions SET
    status = 'canceled',
    current_period_end = now(),
    assigned_by = v_admin_id,
    notes = coalesce(p_notes, 'Desasignado por admin'),
    updated_at = now()
  WHERE business_id = p_business_id;

  -- 4. Audit log
  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'admin_unassign_plan', 'subscription', v_sub.id,
    jsonb_build_object(
      'previous_plan', v_sub.plan_code_snapshot,
      'previous_status', v_sub.status,
      'notes', p_notes
    )
  );

  -- 5. Retorno
  RETURN jsonb_build_object(
    'success', true,
    'code', 'PLAN_UNASSIGNED',
    'message', 'Plan desasignado correctamente (anterior: ' || coalesce(v_sub.plan_code_snapshot, 'N/A') || ')'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_unassign_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_unassign_plan TO authenticated;

-- Verificación
SELECT proname FROM pg_proc
WHERE proname = 'admin_unassign_plan';
