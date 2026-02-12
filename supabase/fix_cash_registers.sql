-- =============================================
-- GastroOS - FIX: Crear tabla cash_registers
-- Ejecuta esto en Supabase SQL Editor
-- =============================================

-- 1. Crear tabla cash_registers si no existe
CREATE TABLE IF NOT EXISTS cash_registers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  opened_at timestamptz DEFAULT now(),
  opening_amount numeric(10,2) DEFAULT 0,
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz,
  expected_cash numeric(10,2),
  counted_cash numeric(10,2),
  difference numeric(10,2),
  deleted_at timestamptz
);

-- 2. Crear índices
CREATE INDEX IF NOT EXISTS idx_cash_registers_business_status 
  ON cash_registers(business_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cash_registers_user_status 
  ON cash_registers(opened_by, status) WHERE deleted_at IS NULL;

-- 3. Habilitar RLS
ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;

-- 4. Crear policy (drop primero si existe)
DROP POLICY IF EXISTS "tenant_isolation" ON cash_registers;
CREATE POLICY "tenant_isolation" ON cash_registers
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- 5. También verificar que payments tenga todas las columnas necesarias
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_register_id uuid REFERENCES cash_registers(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Mostrar mensaje de éxito
SELECT 'cash_registers creada exitosamente' as resultado;
