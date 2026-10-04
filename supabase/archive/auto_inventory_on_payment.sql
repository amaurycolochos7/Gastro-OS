-- =============================================================
-- TRIGGER: Auto-descuento de inventario al recibir un pago
-- Prioridad 1 — Sin esto, inventario ≠ confiable
-- =============================================================
-- Ejecutar en Supabase SQL Editor
-- Este trigger reemplaza la lógica de frontend (POS handlePayment)
-- y garantiza que el descuento sea atómico e infalible.
-- =============================================================

-- 1. Función del trigger (SECURITY DEFINER — corre como owner)
CREATE OR REPLACE FUNCTION auto_deduct_inventory_on_payment()
RETURNS trigger AS $$
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

  -- IDEMPOTENCIA EXPLÍCITA: si ya existen movimientos auto_sale para esta orden, salir
  -- (El índice idx_unique_auto_sale_per_order_item también protege, pero esto es más legible)
  IF EXISTS (
    SELECT 1 FROM inventory_movements
    WHERE ref_entity_id = NEW.order_id
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

    -- Registrar movimiento (ON CONFLICT para doble seguridad con el índice único)
    INSERT INTO inventory_movements (
      item_id, business_id, type, delta, reason,
      ref_entity_type, ref_entity_id, created_by
    ) VALUES (
      r.inventory_item_id,
      NEW.business_id,
      'auto_sale',
      -r.quantity,
      'Venta orden ' || COALESCE(v_order_folio, NEW.order_id::text),
      'order',
      NEW.order_id,
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
          'order_id', NEW.order_id,
          'folio', v_order_folio
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Eliminar trigger anterior si existe
DROP TRIGGER IF EXISTS trg_auto_inventory_on_payment ON payments;

-- 3. Crear trigger AFTER INSERT (el POS inserta pagos directamente como 'paid')
CREATE TRIGGER trg_auto_inventory_on_payment
  AFTER INSERT ON payments
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION auto_deduct_inventory_on_payment();


-- =============================================================
-- Verificación rápida (ejecutar después de una venta en el POS):
-- =============================================================
-- SELECT im.*, ii.name as item_name
-- FROM inventory_movements im
-- JOIN inventory_items ii ON ii.id = im.item_id
-- WHERE im.type = 'auto_sale'
-- ORDER BY im.created_at DESC
-- LIMIT 10;
