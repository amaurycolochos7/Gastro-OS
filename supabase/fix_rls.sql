-- =============================================
-- GastroOS - FIX COMPLETO de RLS
-- Este script arregla los problemas de permisos
-- =============================================

-- 1. Deshabilitar temporalmente RLS en todas las tablas para verificar
-- que las tablas existen y funcionan

-- Primero verificar si existen usuarios autenticados
-- Si no hay business_memberships, los queries fallarán

-- Crear una política más permisiva para cash_registers
DROP POLICY IF EXISTS "tenant_isolation" ON cash_registers;
DROP POLICY IF EXISTS "cash_registers_select" ON cash_registers;
DROP POLICY IF EXISTS "cash_registers_insert" ON cash_registers;
DROP POLICY IF EXISTS "cash_registers_update" ON cash_registers;

-- Política SELECT: usuarios pueden ver sus propios registros o de su negocio
CREATE POLICY "cash_registers_select" ON cash_registers
  FOR SELECT USING (
    opened_by = auth.uid()
    OR business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- Política INSERT: usuarios pueden crear registros en su negocio
CREATE POLICY "cash_registers_insert" ON cash_registers
  FOR INSERT WITH CHECK (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
    AND opened_by = auth.uid()
  );

-- Política UPDATE: usuarios pueden actualizar registros de su negocio
CREATE POLICY "cash_registers_update" ON cash_registers
  FOR UPDATE USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- Hacer lo mismo para payments
DROP POLICY IF EXISTS "tenant_isolation" ON payments;
DROP POLICY IF EXISTS "payments_all" ON payments;

CREATE POLICY "payments_all" ON payments
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- Verificar que la tabla cash_registers tiene datos correctos
SELECT 'Tablas verificadas. Ejecuta SELECT * FROM cash_registers; para ver si hay datos.' as mensaje;

-- Mostrar membresías del usuario actual para debug
SELECT 
  bm.business_id,
  b.name as business_name,
  bm.role
FROM business_memberships bm
JOIN businesses b ON b.id = bm.business_id
WHERE bm.user_id = auth.uid();
