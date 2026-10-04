-- ============================================
-- FIX: current_stock → stock_current + notes → reason
-- ============================================
-- 1) inventory_items usa "stock_current" pero triggers usaban "current_stock"
-- 2) inventory_movements usa "reason" pero triggers usaban "notes"
-- Ejecutar en Supabase SQL Editor.
-- ============================================

-- 0) Expandir CHECK constraint para permitir refund/void
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_type_check;
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_type_check
  CHECK (type IN ('manual_adjustment', 'purchase', 'auto_sale', 'waste', 'refund', 'void'));

-- 1) Corregir trigger de deducción automática al pagar
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
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;

  -- Idempotencia
  IF EXISTS (
    SELECT 1 FROM inventory_movements
    WHERE ref_entity_id = NEW.id
      AND type = 'auto_sale'
      AND deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT folio INTO v_order_folio
  FROM orders WHERE id = NEW.order_id;

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
    PERFORM 1 FROM inventory_items WHERE id = r.inventory_item_id FOR UPDATE;

    -- FIX: stock_current (not current_stock)
    UPDATE inventory_items
    SET stock_current = stock_current - r.quantity
    WHERE id = r.inventory_item_id
    RETURNING stock_current INTO v_new_stock;

    INSERT INTO inventory_movements (
      item_id, business_id, type, delta, ref_entity_id, reason, created_by
    ) VALUES (
      r.inventory_item_id, NEW.business_id, 'auto_sale',
      -r.quantity, NEW.id,
      'Venta orden ' || COALESCE(v_order_folio, NEW.order_id::text),
      NEW.created_by
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_movement_id;

    IF v_movement_id IS NOT NULL THEN
      INSERT INTO audit_logs (
        business_id, actor_user_id, action, entity, entity_id, metadata
      ) VALUES (
        NEW.business_id, NEW.created_by, 'auto_sale', 'inventory',
        r.inventory_item_id,
        jsonb_build_object(
          'type', 'auto_sale',
          'product', r.product_name,
          'delta', -r.quantity,
          'new_stock', v_new_stock,
          'movement_id', v_movement_id,
          'payment_id', NEW.id,
          'order_id', NEW.order_id,
          'folio', v_order_folio
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 2) Corregir trigger de reversión al refund/void
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
  IF OLD.status = 'paid' AND NEW.status IN ('refunded', 'void') THEN

    SELECT folio INTO v_order_folio FROM orders WHERE id = NEW.order_id;

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
        INSERT INTO inventory_movements (
          business_id, item_id, type, delta, ref_entity_id, reason, created_by
        ) VALUES (
          NEW.business_id, r.inventory_item_id,
          CASE WHEN NEW.status = 'refunded' THEN 'refund' ELSE 'void' END,
          r.quantity, NEW.id,
          format('Reversa %s - %s - Folio: %s',
            CASE WHEN NEW.status = 'refunded' THEN 'Refund' ELSE 'Void' END,
            r.product_name, v_order_folio),
          NEW.created_by
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_movement_id;

        IF v_movement_id IS NOT NULL THEN
          -- FIX: stock_current (not current_stock)
          UPDATE inventory_items
          SET stock_current = stock_current + r.quantity
          WHERE id = r.inventory_item_id
          RETURNING stock_current INTO v_new_stock;

          INSERT INTO audit_logs (
            business_id, actor_user_id, action, entity, entity_id, metadata
          ) VALUES (
            NEW.business_id, NEW.created_by,
            CASE WHEN NEW.status = 'refunded' THEN 'refund' ELSE 'void' END,
            'inventory', r.inventory_item_id,
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
