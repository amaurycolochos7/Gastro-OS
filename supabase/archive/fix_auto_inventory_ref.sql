-- ========================================
-- CORRECCIÓN: Auto Inventory Trigger
-- ========================================
-- Este archivo corrige el trigger existente para usar
-- payment.id como ref_entity_id (en lugar de order_id)
-- para mantener consistencia con refund/void reversal
-- ========================================

CREATE OR REPLACE FUNCTION auto_deduct_inventory_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_new_stock numeric;
  v_movement_id uuid;
  v_order_folio text;
BEGIN
  -- Solo procesar pagos con status 'paid'
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;

  -- IDEMPOTENCIA: si ya existen movimientos auto_sale para este payment, salir
  -- IMPORTANTE: ahora buscamos por payment.id (no order_id)
  IF EXISTS (
    SELECT 1 FROM inventory_movements
    WHERE ref_entity_id = NEW.id
      AND type = 'auto_sale'
      AND deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Obtener folio de la orden para el reason
  SELECT folio INTO v_order_folio
  FROM orders
  WHERE id = NEW.order_id;

  -- Iterar sobre los items de la orden que tienen producto con inventario en modo 'auto'
  FOR r IN
    SELECT
      oi.quantity,
      p.inventory_item_id,
      p.name AS product_name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN inventory_items ii ON ii.id = p.inventory_item_id
    WHERE oi.order_id = NEW.order_id
      AND p.inventory_item_id IS NOT NULL
      AND ii.track_mode = 'auto'
      AND ii.deleted_at IS NULL
  LOOP
    -- Lock del item de inventario (previene race conditions)
    PERFORM 1 FROM inventory_items WHERE id = r.inventory_item_id FOR UPDATE;

    -- Actualizar stock
    UPDATE inventory_items
    SET stock_current = stock_current - r.quantity
    WHERE id = r.inventory_item_id
    RETURNING stock_current INTO v_new_stock;

    -- Registrar movimiento
    -- CAMBIO CRÍTICO: ref_entity_id = NEW.id (payment.id, no order_id)
    INSERT INTO inventory_movements (
      item_id,
      business_id,
      type,
      delta,
      ref_entity_id,  -- payment.id
      reason,
      created_by
    ) VALUES (
      r.inventory_item_id,
      NEW.business_id,
      'auto_sale',
      -r.quantity,
      NEW.id,  -- payment.id (ANTES: NEW.order_id)
      'Venta orden ' || COALESCE(v_order_folio, NEW.order_id::text),
      NEW.created_by
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_movement_id;

    -- Solo auditar si realmente se insertó (no fue duplicado)
    IF v_movement_id IS NOT NULL THEN
      INSERT INTO audit_logs (
        business_id, actor_user_id, action, entity, entity_id, metadata
      ) VALUES (
        NEW.business_id,
        NEW.created_by,
        'auto_sale',
        'inventory',
        r.inventory_item_id,
        jsonb_build_object(
          'type', 'auto_sale',
          'product', r.product_name,
          'delta', -r.quantity,
          'new_stock', v_new_stock,
          'movement_id', v_movement_id,
          'payment_id', NEW.id,  -- Agregado para trazabilidad
          'order_id', NEW.order_id,
          'folio', v_order_folio
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Recrear trigger (si no existe, se crea; si existe, se actualiza)
DROP TRIGGER IF EXISTS trg_auto_inventory_on_payment ON payments;
CREATE TRIGGER trg_auto_inventory_on_payment
  AFTER INSERT ON payments
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION auto_deduct_inventory_on_payment();

-- ========================================
-- Actualizar índice de idempotencia
-- ========================================
-- El índice anterior usaba (order_id, item_id)
-- Ahora debe usar (payment_id, item_id)

DROP INDEX IF EXISTS idx_unique_auto_sale_per_order_item;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_auto_sale_per_payment_item
ON inventory_movements (ref_entity_id, item_id, type)
WHERE type = 'auto_sale';

-- ========================================
-- VERIFICACIÓN
-- ========================================

-- Ver función actualizada
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'auto_deduct_inventory_on_payment';

-- Ver trigger
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_auto_inventory_on_payment';

-- Ver índices de idempotencia
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname LIKE '%auto_sale%' OR indexname LIKE '%refund_void%';
