-- ========================================
-- FASE 2: Cierre de Caja Robusto
-- ========================================
-- Source of truth en DB, no en frontend
-- Snapshot de expected_cash histórico
-- Retiro automático registrado como cash_movement
-- ========================================

-- STEP 1: Schema - Configuración de negocios
-- ========================================

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS default_keep_float_amount numeric(10,2) DEFAULT 150.00,
ADD COLUMN IF NOT EXISTS cash_difference_threshold numeric(10,2) DEFAULT 20.00;

COMMENT ON COLUMN businesses.default_keep_float_amount IS 'Fondo sugerido para dejar en caja al cerrar turno';
COMMENT ON COLUMN businesses.cash_difference_threshold IS 'Umbral de diferencia para exigir notas de cierre';

-- ========================================
-- STEP 2: Schema - Cash Registers
-- ========================================

ALTER TABLE cash_registers
ADD COLUMN IF NOT EXISTS keep_float_amount numeric(10,2),
ADD COLUMN IF NOT EXISTS withdrawn_cash numeric(10,2),
ADD COLUMN IF NOT EXISTS closing_notes text,
ADD COLUMN IF NOT EXISTS expected_cash_snapshot numeric(10,2),
ADD COLUMN IF NOT EXISTS counted_cash numeric(10,2),
ADD COLUMN IF NOT EXISTS requires_review boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reviewed_by uuid, -- Sin FK por ahora, o usa: REFERENCES auth.users(id)
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS count_breakdown jsonb;

COMMENT ON COLUMN cash_registers.keep_float_amount IS 'Fondo dejado para siguiente turno';
COMMENT ON COLUMN cash_registers.withdrawn_cash IS 'Efectivo retirado al cerrar';
COMMENT ON COLUMN cash_registers.closing_notes IS 'Notas obligatorias si diferencia > threshold';
COMMENT ON COLUMN cash_registers.expected_cash_snapshot IS 'Snapshot histórico del efectivo esperado al cerrar';
COMMENT ON COLUMN cash_registers.counted_cash IS 'Efectivo contado por el cajero';
COMMENT ON COLUMN cash_registers.requires_review IS 'Cierre requiere revisión de admin por diferencia';
COMMENT ON COLUMN cash_registers.count_breakdown IS 'Desglose de billetes/monedas (opcional, formato: {"20": 3, "50": 1})';

-- ========================================
-- STEP 3: RPC - get_cash_register_summary
-- ========================================
-- Source of truth: cálculos centralizados

CREATE OR REPLACE FUNCTION get_cash_register_summary(
  p_cash_register_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_register record;
  v_cash_sales numeric := 0;
  v_card_sales numeric := 0;
  v_transfer_sales numeric := 0;
  v_cash_voids numeric := 0;
  v_cash_refunds numeric := 0;
  v_cash_in numeric := 0;
  v_cash_out numeric := 0;
  v_expected_cash numeric := 0;
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- Obtener registro
  SELECT * INTO v_register FROM cash_registers WHERE id = p_cash_register_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash register not found';
  END IF;
  
  -- Ventas por método (status='paid')
  SELECT 
    COALESCE(SUM(CASE WHEN method = 'cash' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN method = 'card' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN method = 'transfer' THEN amount ELSE 0 END), 0)
  INTO v_cash_sales, v_card_sales, v_transfer_sales
  FROM payments
  WHERE cash_register_id = p_cash_register_id
    AND status = 'paid';
  
  -- Voids/Refunds en efectivo (solo efectivo impacta caja)
  SELECT 
    COALESCE(SUM(CASE WHEN status = 'void' AND method = 'cash' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'refunded' AND method = 'cash' THEN amount ELSE 0 END), 0)
  INTO v_cash_voids, v_cash_refunds
  FROM payments
  WHERE cash_register_id = p_cash_register_id
    AND status IN ('void', 'refunded');
  
  -- Cash movements
  SELECT 
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out
  FROM cash_movements
  WHERE cash_register_id = p_cash_register_id
    AND deleted_at IS NULL;
  
  -- Expected cash (fórmula)
  v_expected_cash := v_register.opening_amount 
    + v_cash_sales 
    + v_cash_in 
    - v_cash_out 
    - v_cash_voids 
    - v_cash_refunds;
  
  -- Warnings (pagos huérfanos, movimientos sin razón, etc.)
  -- TODO: agregar validaciones específicas según necesidad
  
  RETURN json_build_object(
    'opening_amount', v_register.opening_amount,
    'sales_cash', v_cash_sales,
    'sales_card', v_card_sales,
    'sales_transfer', v_transfer_sales,
    'cash_in', v_cash_in,
    'cash_out', v_cash_out,
    'voids_cash', v_cash_voids,
    'refunds_cash', v_cash_refunds,
    'expected_cash', v_expected_cash,
    'warnings', v_warnings
  );
END;
$$;

-- ========================================
-- STEP 4: RPC - close_cash_register
-- ========================================
-- Cierre transaccional con retiro automático

CREATE OR REPLACE FUNCTION close_cash_register(
  p_cash_register_id uuid,
  p_counted_cash numeric,
  p_keep_float_amount numeric,
  p_closing_notes text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_register record;
  v_business record;
  v_summary json;
  v_expected_cash numeric;
  v_difference numeric;
  v_withdrawn_cash numeric;
  v_requires_review boolean := false;
BEGIN
  -- 1. Validar registro
  SELECT * INTO v_register FROM cash_registers WHERE id = p_cash_register_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cash register not found';
  END IF;
  
  IF v_register.status != 'open' THEN
    RAISE EXCEPTION 'Cash register is not open';
  END IF;
  
  -- 2. Obtener configuración del negocio
  SELECT * INTO v_business FROM businesses WHERE id = v_register.business_id;
  
  -- 3. Calcular summary (source of truth)
  v_summary := get_cash_register_summary(p_cash_register_id);
  v_expected_cash := (v_summary->>'expected_cash')::numeric;
  
  -- 4. Calcular diferencia
  v_difference := p_counted_cash - v_expected_cash;
  
  -- 5. Validar notas si diferencia excede threshold
  IF ABS(v_difference) > v_business.cash_difference_threshold THEN
    IF p_closing_notes IS NULL OR p_closing_notes = '' THEN
      RAISE EXCEPTION 'Closing notes required: difference $% exceeds threshold $%', 
        v_difference, v_business.cash_difference_threshold;
    END IF;
    v_requires_review := true;
  END IF;
  
  -- 6. Calcular retiro
  v_withdrawn_cash := GREATEST(0, p_counted_cash - p_keep_float_amount);
  
  -- 7. Actualizar cash register
  UPDATE cash_registers
  SET 
    status = 'closed',
    closed_at = NOW(),
    closed_by = p_user_id,
    counted_cash = p_counted_cash,
    expected_cash_snapshot = v_expected_cash,
    keep_float_amount = p_keep_float_amount,
    withdrawn_cash = v_withdrawn_cash,
    closing_notes = p_closing_notes,
    requires_review = v_requires_review,
    updated_at = NOW()
  WHERE id = p_cash_register_id;
  
  -- 8. Registrar retiro como cash_movement (consistencia contable)
  IF v_withdrawn_cash > 0 THEN
    INSERT INTO cash_movements (
      business_id, cash_register_id, type, amount, reason, created_by
    ) VALUES (
      v_register.business_id,
      p_cash_register_id,
      'out',
      v_withdrawn_cash,
      'Retiro por cierre de turno',
      p_user_id
    );
  END IF;
  
  -- 9. Auditoría
  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_register.business_id,
    p_user_id,
    'close_register',
    'cash_register',
    p_cash_register_id,
    jsonb_build_object(
      'expected_cash', v_expected_cash,
      'counted_cash', p_counted_cash,
      'difference', v_difference,
      'keep_float', p_keep_float_amount,
      'withdrawn', v_withdrawn_cash,
      'requires_review', v_requires_review,
      'notes', p_closing_notes
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'expected_cash', v_expected_cash,
    'counted_cash', p_counted_cash,
    'difference', v_difference,
    'withdrawn_cash', v_withdrawn_cash,
    'keep_float_amount', p_keep_float_amount,
    'requires_review', v_requires_review
  );
END;
$$;

-- ========================================
-- VERIFICACIÓN
-- ========================================

-- Ver columnas agregadas a businesses
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'businesses' 
  AND column_name IN ('default_keep_float_amount', 'cash_difference_threshold');

-- Ver columnas agregadas a cash_registers
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'cash_registers' 
  AND column_name IN ('keep_float_amount', 'withdrawn_cash', 'closing_notes', 
                       'expected_cash_snapshot', 'counted_cash', 'requires_review', 
                       'reviewed_by', 'reviewed_at', 'count_breakdown');

-- Ver RPCs creados
SELECT routine_name
FROM information_schema.routines
WHERE routine_name IN ('get_cash_register_summary', 'close_cash_register')
  AND routine_schema = 'public';
