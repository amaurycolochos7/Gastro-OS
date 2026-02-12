-- =============================================
-- GastroOS - Mejorar tabla business_memberships para gestión de equipo
-- =============================================

-- Añadir campo status (pending, active, disabled)
ALTER TABLE business_memberships 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active' CHECK (status IN ('pending', 'active', 'disabled'));

-- Añadir campo para invitación por email (cuando user_id aún no existe)
ALTER TABLE business_memberships 
ADD COLUMN IF NOT EXISTS invited_email text;

-- Añadir soft delete
ALTER TABLE business_memberships 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Actualizar constraint para permitir invitaciones sin user_id
-- DROP CONSTRAINT y recrear con OR NULL
-- ALTER TABLE business_memberships ALTER COLUMN user_id DROP NOT NULL;

-- Crear índice para buscar por email de invitación
CREATE INDEX IF NOT EXISTS idx_business_memberships_invited_email 
ON business_memberships(invited_email) 
WHERE invited_email IS NOT NULL;

-- RLS para que OWNER pueda gestionar membresías
DROP POLICY IF EXISTS "owner_manages_memberships" ON business_memberships;
CREATE POLICY "owner_manages_memberships" ON business_memberships
  FOR ALL USING (
    business_id IN (
      SELECT business_id FROM business_memberships 
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );
