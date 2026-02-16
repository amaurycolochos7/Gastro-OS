-- ============================================
-- FIX: Permitir crear negocios (Onboarding)
-- ============================================

-- Actualmente la política RLS de 'businesses' probablemente solo permite SELECT
-- O solo permite INSERT si ya eres dueño (huevo y gallina)

-- Eliminamos política restrictiva si existe
DROP POLICY IF EXISTS "businesses_insert" ON businesses;

-- Creamos política que permita INSERT a cualquier usuario autenticado
-- (El trigger de límites o business_memberships se encargará de validar lo demás)
CREATE POLICY "businesses_insert_authenticated" ON businesses
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Asegurar que propietarios puedan ver/editar su negocio
DROP POLICY IF EXISTS "businesses_select_owner" ON businesses;
CREATE POLICY "businesses_select_owner" ON businesses
  FOR SELECT
  USING (
    id IN (
        SELECT business_id FROM business_memberships 
        WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "businesses_update_owner" ON businesses;
CREATE POLICY "businesses_update_owner" ON businesses
  FOR UPDATE
  USING (
    id IN (
        SELECT business_id FROM business_memberships 
        WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );
