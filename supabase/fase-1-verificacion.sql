-- =================================================================
-- FASE 1: Verificación y Pre-requisitos
-- =================================================================
-- Ejecutar este SQL ANTES de usar el POS con el nuevo flujo
-- =================================================================

-- 1. Verificar que el trigger de inventario existe
SELECT 
    tgname as trigger_name,
    proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname = 'trg_auto_inventory_on_payment';

-- Expected: 1 row con trigger_name = 'trg_auto_inventory_on_payment'
-- Si NO aparece, ejecutar supabase/auto_inventory_on_payment.sql

-- 2. Verificar índice único para idempotencia
SELECT indexname
FROM pg_indexes
WHERE indexname = 'idx_unique_auto_sale_per_order_item';

-- Expected: 1 row
-- Si NO existe, crear el índice (SIN CONCURRENTLY para Supabase SQL Editor):
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_auto_sale_per_order_item 
-- ON inventory_movements (ref_entity_id, item_id, type) 
-- WHERE type = 'auto_sale' AND deleted_at IS NULL;

-- 3. Verificar que businesses tiene operation_mode
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'businesses'
  AND column_name IN ('operation_mode', 'name');

-- Expected: 2 rows (operation_mode, name)
-- Si operation_mode NO existe, agregarlo:
-- ALTER TABLE businesses 
-- ADD COLUMN IF NOT EXISTS operation_mode text DEFAULT 'restaurant' 
-- CHECK (operation_mode IN ('restaurant', 'counter'));

-- 4. Configurar operation_mode para tu negocio
-- Cambia BUSINESS_ID con tu ID real
UPDATE businesses
SET operation_mode = 'restaurant'  -- o 'counter'
WHERE id = 'BUSINESS_ID';

-- 5. Verificar que orders tiene las columnas de descuento
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('discount_amount', 'discount_reason');

-- Expected: 2 rows
-- Si NO existen, ya deberían estar en schema.sql original
-- pero si falta:
-- ALTER TABLE orders 
-- ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) DEFAULT 0,
-- ADD COLUMN IF NOT EXISTS discount_reason text;

-- =================================================================
-- POST-IMPLEMENTACIÓN: Validación
-- =================================================================

-- Después de hacer una venta de prueba, verificar:

-- 1. Que la orden se creó con el status correcto
SELECT id, folio, status, service_type, discount_amount, discount_reason
FROM orders
ORDER BY created_at DESC
LIMIT 5;

-- Expected para restaurant: status = 'IN_PREP'
-- Expected para counter: status = 'READY'

-- 2. Que el inventario se descontó automáticamente por el trigger
SELECT 
    im.created_at,
    im.type,
    im.delta,
    im.reason,
    ii.name as item_name,
    ii.stock_current
FROM inventory_movements im
JOIN inventory_items ii ON ii.id = im.item_id
WHERE im.type = 'auto_sale'
ORDER BY im.created_at DESC
LIMIT 10;

-- Expected: movimientos con type='auto_sale', delta negativo

-- 3. Que NO hay logs de inventario en el browser console
-- Abrir DevTools > Console y buscar "[Inventario]"
-- Expected: NO debe aparecer nada (el loop fue eliminado)

-- 4. Verificar audit_logs
-- NOTA: El trigger usa action='auto_sale' (no estándar pero así está implementado)
SELECT 
    action,
    entity,
    metadata->>'type' as type,
    metadata->>'product' as product_name,
    metadata->>'delta' as delta,
    metadata->>'new_stock' as new_stock,
    created_at
FROM audit_logs
WHERE action = 'auto_sale'
  AND entity = 'inventory'
ORDER BY created_at DESC
LIMIT 10;

-- Expected: registros con action='auto_sale', entity='inventory'
-- metadata debe tener: type, product, delta, new_stock, movement_id, order_id, folio
