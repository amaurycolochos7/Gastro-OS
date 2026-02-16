-- =============================================
-- GastroOS - Fix: Plan Básico → 10 productos
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================
-- Cambia el límite de productos del plan Básico de 50 a 10.
-- También actualiza los límites en businesses que tengan este plan activo.

-- 1. Actualizar el plan en la tabla plans
UPDATE plans
SET features = jsonb_set(features, '{limits_products}', '10')
WHERE slug = 'basic';

-- 2. Aplicar el nuevo límite a todos los negocios que tengan plan básico activo
UPDATE businesses b
SET limits_products = 10
FROM subscriptions s
JOIN plans p ON s.plan_id = p.id
WHERE s.business_id = b.id
  AND p.slug = 'basic'
  AND s.status IN ('active', 'trialing');

-- 3. Verificación
SELECT slug, features->>'limits_products' as limits_products FROM plans WHERE slug = 'basic';
