-- =============================================
-- GastroOS - Migration Script
-- Ejecuta solo lo que falta (no duplica tablas existentes)
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- CREAR TABLAS FALTANTES (IF NOT EXISTS)
-- =============================================

-- Negocios (Multi-tenant)
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL,
  operation_mode text NOT NULL DEFAULT 'counter',
  logo_url text,
  limits_products integer DEFAULT 100,
  limits_orders_day integer DEFAULT 200,
  limits_users integer DEFAULT 3,
  limits_storage_mb integer DEFAULT 50,
  created_at timestamptz DEFAULT now()
);

-- Membresías (Auth + Roles)
CREATE TABLE IF NOT EXISTS business_memberships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'CASHIER', 'KITCHEN', 'INVENTORY')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, user_id)
);

-- Categorías de productos
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer DEFAULT 0,
  active boolean DEFAULT true
);

-- Items de inventario
CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  unit text NOT NULL DEFAULT 'pz' CHECK (unit IN ('pz', 'paquete', 'caja', 'litro', 'kg', 'g', 'ml')),
  stock_current numeric(10,3) DEFAULT 0,
  stock_min numeric(10,3) DEFAULT 0,
  track_mode text NOT NULL DEFAULT 'manual' CHECK (track_mode IN ('manual', 'auto')),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Productos
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  image_url text,
  has_recipe boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  inventory_item_id uuid REFERENCES inventory_items(id)
);

-- Secuencias de folios
CREATE TABLE IF NOT EXISTS folio_sequences (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  last_folio integer DEFAULT 0
);

-- Cajas registradoras (turnos)
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

-- Órdenes
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  folio text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PREP', 'READY', 'DELIVERED', 'CLOSED', 'CANCELLED')),
  service_type text NOT NULL DEFAULT 'dine_in' CHECK (service_type IN ('dine_in', 'takeaway', 'delivery')),
  table_number text,
  subtotal_snapshot numeric(10,2),
  discount_amount numeric(10,2) DEFAULT 0,
  discount_reason text,
  tax_snapshot numeric(10,2) DEFAULT 0,
  total_snapshot numeric(10,2),
  notes text,
  cancel_reason text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Items de orden
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  price_snapshot numeric(10,2) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  notes text
);

-- Pagos
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  cash_register_id uuid NOT NULL REFERENCES cash_registers(id),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'card', 'transfer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'void')),
  paid_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  deleted_at timestamptz
);

-- Movimientos de caja
CREATE TABLE IF NOT EXISTS cash_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_register_id uuid NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('in', 'out')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Movimientos de inventario
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('manual_adjustment', 'purchase', 'auto_sale', 'waste')),
  delta numeric(10,3) NOT NULL,
  reason text,
  ref_entity_type text CHECK (ref_entity_type IN ('order', 'payment')),
  ref_entity_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Gastos
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Logs de auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'cancel', 'refund', 'void')),
  entity text NOT NULL CHECK (entity IN ('order', 'payment', 'cash_register', 'cash_movement', 'inventory', 'product')),
  entity_id uuid NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- =============================================
-- INDEXES (se ignoran si ya existen)
-- =============================================

CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_business_status ON orders(business_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_cash_register ON payments(cash_register_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cash_registers_business_status ON cash_registers(business_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cash_registers_user_status ON cash_registers(opened_by, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_items_business_active ON inventory_items(business_id, active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_business_date ON inventory_movements(business_id, created_at DESC) WHERE deleted_at IS NULL;

-- =============================================
-- FUNCTIONS (CREATE OR REPLACE)
-- =============================================

-- Generar folio secuencial
CREATE OR REPLACE FUNCTION get_next_folio(p_business_id uuid)
RETURNS text AS $$
DECLARE
  next_val integer;
BEGIN
  INSERT INTO folio_sequences (business_id, last_folio)
  VALUES (p_business_id, 1)
  ON CONFLICT (business_id) DO UPDATE
  SET last_folio = folio_sequences.last_folio + 1
  RETURNING last_folio INTO next_val;
  
  RETURN 'GOS-' || LPAD(next_val::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TRIGGERS (DROP IF EXISTS + CREATE)
-- =============================================

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES (DROP IF EXISTS + CREATE)
-- =============================================

-- businesses
DROP POLICY IF EXISTS "tenant_isolation" ON businesses;
CREATE POLICY "tenant_isolation" ON businesses
  FOR ALL USING (
    id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "users_can_create_business" ON businesses;
CREATE POLICY "users_can_create_business" ON businesses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- business_memberships
DROP POLICY IF EXISTS "tenant_isolation" ON business_memberships;
CREATE POLICY "tenant_isolation" ON business_memberships
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_can_create_membership" ON business_memberships;
CREATE POLICY "users_can_create_membership" ON business_memberships
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- categories
DROP POLICY IF EXISTS "tenant_isolation" ON categories;
CREATE POLICY "tenant_isolation" ON categories
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- products
DROP POLICY IF EXISTS "tenant_isolation" ON products;
CREATE POLICY "tenant_isolation" ON products
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- inventory_items
DROP POLICY IF EXISTS "tenant_isolation" ON inventory_items;
CREATE POLICY "tenant_isolation" ON inventory_items
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- cash_registers
DROP POLICY IF EXISTS "tenant_isolation" ON cash_registers;
CREATE POLICY "tenant_isolation" ON cash_registers
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- orders
DROP POLICY IF EXISTS "tenant_isolation" ON orders;
CREATE POLICY "tenant_isolation" ON orders
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- order_items
DROP POLICY IF EXISTS "tenant_isolation" ON order_items;
CREATE POLICY "tenant_isolation" ON order_items
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- payments
DROP POLICY IF EXISTS "tenant_isolation" ON payments;
CREATE POLICY "tenant_isolation" ON payments
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- cash_movements
DROP POLICY IF EXISTS "tenant_isolation" ON cash_movements;
CREATE POLICY "tenant_isolation" ON cash_movements
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- inventory_movements
DROP POLICY IF EXISTS "tenant_isolation" ON inventory_movements;
CREATE POLICY "tenant_isolation" ON inventory_movements
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- expenses
DROP POLICY IF EXISTS "tenant_isolation" ON expenses;
CREATE POLICY "tenant_isolation" ON expenses
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- audit_logs
DROP POLICY IF EXISTS "tenant_isolation" ON audit_logs;
CREATE POLICY "tenant_isolation" ON audit_logs
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- =============================================
-- FIX: Actualizar productos existentes
-- =============================================
UPDATE products SET active = true WHERE active IS NULL;
UPDATE categories SET active = true WHERE active IS NULL;
