-- =============================================
-- GastroOS - DIAGNÓSTICO Y FIX de políticas RLS
-- Ejecutar en Supabase SQL Editor
-- =============================================

-- PASO 1: Ver todas las políticas actuales en business_memberships
SELECT 
  policyname,
  permissive,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'business_memberships';

-- PASO 2: Verificar que hay datos en las tablas
SELECT 'businesses' as tabla, COUNT(*) as total FROM businesses
UNION ALL
SELECT 'business_memberships' as tabla, COUNT(*) as total FROM business_memberships;

-- PASO 3: Ver membresías con detalles del negocio
SELECT 
  bm.id,
  bm.user_id,
  bm.business_id,
  bm.role,
  bm.status,
  b.name as business_name
FROM business_memberships bm
LEFT JOIN businesses b ON b.id = bm.business_id;
