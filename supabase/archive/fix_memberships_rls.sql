-- =============================================
-- GastroOS - FIX: Limpiar políticas duplicadas
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =============================================

-- PASO 1: Eliminar TODAS las políticas duplicadas
DROP POLICY IF EXISTS "memberships_delete" ON business_memberships;
DROP POLICY IF EXISTS "memberships_insert" ON business_memberships;
DROP POLICY IF EXISTS "memberships_select" ON business_memberships;
DROP POLICY IF EXISTS "memberships_update" ON business_memberships;
DROP POLICY IF EXISTS "owner_can_manage_team" ON business_memberships;
DROP POLICY IF EXISTS "tenant_isolation" ON business_memberships;
DROP POLICY IF EXISTS "users_can_create_membership" ON business_memberships;
DROP POLICY IF EXISTS "owner_manages_memberships" ON business_memberships;

-- PASO 2: Crear políticas limpias y simples

-- SELECT: Ver mi propia membresía
CREATE POLICY "memberships_select" ON business_memberships
  FOR SELECT USING (user_id = auth.uid());

-- INSERT: Crear mi primera membresía (onboarding) o OWNER invita
CREATE POLICY "memberships_insert" ON business_memberships
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR business_id IN (
      SELECT business_id FROM business_memberships 
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- UPDATE: Solo OWNER puede modificar membresías de su negocio
CREATE POLICY "memberships_update" ON business_memberships
  FOR UPDATE USING (
    business_id IN (
      SELECT business_id FROM business_memberships 
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- DELETE: Solo OWNER puede eliminar membresías de su negocio
CREATE POLICY "memberships_delete" ON business_memberships
  FOR DELETE USING (
    business_id IN (
      SELECT business_id FROM business_memberships 
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

-- Verificar que quedaron solo 4 políticas
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'business_memberships';
