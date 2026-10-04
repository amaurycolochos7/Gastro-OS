-- ========================================
-- FASE 2: Cancel, Refund, Void - SQL Implementation
-- ========================================

-- STEP 1: Schema Changes
-- Agregar columnas de auditoría a payments
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS void_reason text,
ADD COLUMN IF NOT EXISTS voided_at timestamptz,
ADD COLUMN IF NOT EXISTS refund_reason text,
ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Agregar columnas de cancelación a orders
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS cancel_reason text,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ========================================
-- STEP 2: RPC - cancel_order
-- ========================================

CREATE OR REPLACE FUNCTION cancel_order(
  p_order_id uuid,
  p_cancel_reason text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_payment record;
BEGIN
  -- 1. Validar orden existe
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  
  IF v_order.status NOT IN ('OPEN', 'IN_PREP') THEN
    RAISE EXCEPTION 'Order cannot be cancelled in status: %', v_order.status;
  END IF;
  
  -- 2. Bloquear si existe payment paid
  SELECT * INTO v_payment 
  FROM payments 
  WHERE order_id = p_order_id 
    AND status = 'paid'
  LIMIT 1;
  
  IF FOUND THEN
    RAISE EXCEPTION 'Cannot cancel paid order. Use refund/void instead.';
  END IF;
  
  -- 3. Cancelar orden
  UPDATE orders
  SET 
    status = 'CANCELLED',
    cancel_reason = p_cancel_reason,
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;
  
  -- 4. Auditoría
  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_order.business_id,
    p_user_id,
    'cancel',
    'order',
    p_order_id,
    jsonb_build_object(
      'reason', p_cancel_reason,
      'folio', v_order.folio,
      'previous_status', v_order.status
    )
  );
  
  RETURN json_build_object('success', true, 'folio', v_order.folio);
END;
$$;

-- ========================================
-- STEP 3: RPC - void_payment
-- ========================================

CREATE OR REPLACE FUNCTION void_payment(
  p_payment_id uuid,
  p_void_reason text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment record;
  v_order record;
  v_current_cash_register uuid;
BEGIN
  -- 1. Validar payment existe
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;
  
  -- 2. Requiere status='paid'
  IF v_payment.status != 'paid' THEN
    RAISE EXCEPTION 'Only paid payments can be voided. Current status: %', v_payment.status;
  END IF;
  
  -- 3. Requiere que sea del turno abierto actual
  SELECT id INTO v_current_cash_register
  FROM cash_registers
  WHERE business_id = v_payment.business_id
    AND status = 'open'
  LIMIT 1;
  
  IF v_current_cash_register IS NULL THEN
    RAISE EXCEPTION 'No open cash register found. Use refund instead.';
  END IF;
  
  IF v_current_cash_register != v_payment.cash_register_id THEN
    RAISE EXCEPTION 'Can only void payments from current open cash register. Use refund instead.';
  END IF;
  
  -- 4. Void payment
  UPDATE payments
  SET 
    status = 'void',
    void_reason = p_void_reason,
    voided_at = NOW(),
    updated_at = NOW()
  WHERE id = p_payment_id;
  
  -- 5. Cancelar orden asociada
  SELECT * INTO v_order FROM orders WHERE id = v_payment.order_id;
  
  UPDATE orders
  SET 
    status = 'CANCELLED',
    updated_at = NOW()
  WHERE id = v_payment.order_id;
  
  -- 6. Auditoría
  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_payment.business_id,
    p_user_id,
    'void',
    'payment',
    p_payment_id,
    jsonb_build_object(
      'reason', p_void_reason,
      'order_id', v_payment.order_id,
      'folio', v_order.folio,
      'amount', v_payment.amount,
      'method', v_payment.method
    )
  );
  
  RETURN json_build_object('success', true, 'folio', v_order.folio);
END;
$$;

-- ========================================
-- STEP 4: RPC - refund_payment
-- ========================================

CREATE OR REPLACE FUNCTION refund_payment(
  p_payment_id uuid,
  p_refund_reason text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment record;
  v_order record;
  v_current_cash_register uuid;
BEGIN
  -- 1. Validar payment existe
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;
  
  -- 2. Requiere status='paid'
  IF v_payment.status != 'paid' THEN
    RAISE EXCEPTION 'Only paid payments can be refunded. Current status: %', v_payment.status;
  END IF;
  
  -- 3. Requiere que NO sea del turno abierto actual (o que no haya turno)
  SELECT id INTO v_current_cash_register
  FROM cash_registers
  WHERE business_id = v_payment.business_id
    AND status = 'open'
  LIMIT 1;
  
  IF v_current_cash_register IS NOT NULL AND v_current_cash_register = v_payment.cash_register_id THEN
    RAISE EXCEPTION 'Cannot refund payment from current open cash register. Use void instead.';
  END IF;
  
  -- 4. Refund payment
  UPDATE payments
  SET 
    status = 'refunded',
    refund_reason = p_refund_reason,
    refunded_at = NOW(),
    updated_at = NOW()
  WHERE id = p_payment_id;
  
  -- 5. Cancelar orden asociada
  SELECT * INTO v_order FROM orders WHERE id = v_payment.order_id;
  
  UPDATE orders
  SET 
    status = 'CANCELLED',
    updated_at = NOW()
  WHERE id = v_payment.order_id;
  
  -- 6. Auditoría
  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_payment.business_id,
    p_user_id,
    'refund',
    'payment',
    p_payment_id,
    jsonb_build_object(
      'reason', p_refund_reason,
      'order_id', v_payment.order_id,
      'folio', v_order.folio,
      'amount', v_payment.amount,
      'method', v_payment.method
    )
  );
  
  RETURN json_build_object('success', true, 'folio', v_order.folio);
END;
$$;

-- ========================================
-- STEP 5: Trigger - Reversión de Inventario
-- ========================================
-- IMPORTANTE: Usa payment.id como ref_entity_id para consistencia
-- con el trigger de auto_inventory_on_payment

CREATE OR REPLACE FUNCTION reverse_inventory_on_refund_void()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_folio text;
  r record;
  v_movement_id uuid;
  v_new_stock numeric;
BEGIN
  -- Solo si cambia de 'paid' a 'refunded' o 'void'
  IF OLD.status = 'paid' AND NEW.status IN ('refunded', 'void') THEN
    
    -- Obtener folio de la orden
    SELECT folio INTO v_order_folio FROM orders WHERE id = NEW.order_id;
    
    -- Por cada item de la orden, revertir inventario
    FOR r IN
      SELECT 
        oi.id as order_item_id,
        oi.product_id,
        oi.quantity,
        oi.name_snapshot as product_name,
        p.inventory_item_id
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.order_id
    LOOP
      IF r.inventory_item_id IS NOT NULL THEN
        -- Insertar movimiento inverso (delta positivo = devolver stock)
        -- IMPORTANTE: ref_entity_id = payment.id (consistente con auto_deduct)
        INSERT INTO inventory_movements (
          business_id,
          item_id,
          type,
          delta,
          ref_entity_id,
          reason,
          created_by
        )
        VALUES (
          NEW.business_id,
          r.inventory_item_id,
          CASE WHEN NEW.status = 'refunded' THEN 'refund' ELSE 'void' END,
          r.quantity,  -- positivo = devolver
          NEW.id,  -- payment.id (no order_item.id)
          format('Reversa %s - %s - Folio: %s', 
            CASE WHEN NEW.status = 'refunded' THEN 'Refund' ELSE 'Void' END,
            r.product_name, 
            v_order_folio),
          NEW.created_by
        )
        ON CONFLICT DO NOTHING  -- Idempotencia
        RETURNING id INTO v_movement_id;
        
        -- Actualizar stock actual
        IF v_movement_id IS NOT NULL THEN
          UPDATE inventory_items
          SET stock_current = stock_current + r.quantity
          WHERE id = r.inventory_item_id
          RETURNING stock_current INTO v_new_stock;
          
          -- Auditoría
          INSERT INTO audit_logs (
            business_id, actor_user_id, action, entity, entity_id, metadata
          ) VALUES (
            NEW.business_id,
            NEW.created_by,
            CASE WHEN NEW.status = 'refunded' THEN 'refund' ELSE 'void' END,
            'inventory',
            r.inventory_item_id,
            jsonb_build_object(
              'type', CASE WHEN NEW.status = 'refunded' THEN 'refund' ELSE 'void' END,
              'product', r.product_name,
              'delta', r.quantity,
              'new_stock', v_new_stock,
              'movement_id', v_movement_id,
              'payment_id', NEW.id,
              'order_id', NEW.order_id,
              'folio', v_order_folio,
              'reason', CASE WHEN NEW.status = 'refunded' THEN NEW.refund_reason ELSE NEW.void_reason END
            )
          );
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger
DROP TRIGGER IF EXISTS trg_reverse_inventory_on_refund_void ON payments;
CREATE TRIGGER trg_reverse_inventory_on_refund_void
  AFTER UPDATE ON payments
  FOR EACH ROW
  WHEN (OLD.status = 'paid' AND NEW.status IN ('refunded', 'void'))
  EXECUTE FUNCTION reverse_inventory_on_refund_void();

-- ========================================
-- STEP 6: Índice único para idempotencia
-- ========================================
-- Asegura que cada payment solo genere UNA reversa por item
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_refund_void_per_payment_item
ON inventory_movements (ref_entity_id, item_id, type)
WHERE type IN ('refund', 'void');

-- ========================================
-- VERIFICACIÓN
-- ========================================

-- Ver columnas agregadas a payments
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'payments' 
  AND column_name IN ('void_reason', 'voided_at', 'refund_reason', 'refunded_at');

-- Ver RPCs creados
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('cancel_order', 'void_payment', 'refund_payment')
  AND routine_schema = 'public';

-- Ver trigger de reversa
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trg_reverse_inventory_on_refund_void';
