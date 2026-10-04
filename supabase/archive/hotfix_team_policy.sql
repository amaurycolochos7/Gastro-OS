-- =============================================
-- HOTFIX: Restaurar acceso a business_memberships
-- =============================================

-- La policy "owner_manages_memberships" reemplazó la policy "tenant_isolation"
-- Esto rompió el acceso normal. Vamos a arreglarlo.

-- 1. Eliminar la policy problemática
DROP POLICY IF EXISTS "owner_manages_memberships" ON business_memberships;

-- 2. La policy "tenant_isolation" ya existe y funciona bien
-- Solo necesitamos asegurarnos de que esté activa
-- (No necesitamos recrearla, ya existe en schema.sql)

-- 3. Crear una policy ADICIONAL solo para que OWNER pueda gestionar su equipo
-- Esta policy es ADICIONAL, no reemplaza tenant_isolation
CREATE POLICY "owner_can_manage_team" ON business_memberships
  FOR ALL USING (
    -- Puedes ver/editar membresías de tu negocio si eres OWNER
    business_id IN (
      SELECT business_id FROM business_memberships 
      WHERE user_id = auth.uid() AND role = 'OWNER' AND (deleted_at IS NULL OR deleted_at IS NULL)
    )
    OR
    -- O si es tu propia membresía (esto ya lo cubre tenant_isolation, pero por si acaso)
    user_id = auth.uid()
  );

-- 4. Verificar que todos los registros existentes tengan status='active'
UPDATE business_memberships 
SET status = 'active' 
WHERE status IS NULL;
