-- =============================================
-- GastroOS - Database Schema
-- Sistema POS para negocios de comida
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Negocios (Multi-tenant)
CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL, -- 'taqueria', 'pizzeria', 'cafeteria', 'fast_food', 'other'
  operation_mode text NOT NULL DEFAULT 'counter', -- 'counter', 'restaurant'
  logo_url text,
  limits_products integer DEFAULT 100,
  limits_orders_day integer DEFAULT 200,
  limits_users integer DEFAULT 3,
  limits_storage_mb integer DEFAULT 50,
  default_keep_float_amount numeric(10,2) DEFAULT 150.00,
  cash_difference_threshold numeric(10,2) DEFAULT 20.00,
  created_at timestamptz DEFAULT now()
);

-- Membresías (Auth + Roles)
CREATE TABLE business_memberships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'CASHIER', 'KITCHEN', 'INVENTORY')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, user_id)
);

-- Categorías de productos
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer DEFAULT 0,
  active boolean DEFAULT true
);

-- Items de inventario (reemplaza ingredients + recipes)
CREATE TABLE inventory_items (
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
CREATE TABLE products (
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
CREATE TABLE folio_sequences (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  last_folio integer DEFAULT 0
);

-- Cajas registradoras (turnos)
CREATE TABLE cash_registers (
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
  -- Hardening constraints (Phase 3)
  keep_float_amount numeric(10,2),
  withdrawn_cash numeric(10,2),
  closing_notes text,
  expected_cash_snapshot numeric(10,2),
  requires_review boolean DEFAULT false,
  reviewed_by uuid, -- References auth.users(id)
  reviewed_at timestamptz,
  count_breakdown jsonb,
  summary_snapshot jsonb, -- Fuente de verdad inmutable
  deleted_at timestamptz
);

CREATE INDEX idx_cash_registers_business_opened ON cash_registers(business_id, opened_at DESC);

-- Órdenes
CREATE TABLE orders (
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
CREATE TABLE order_items (
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
CREATE TABLE payments (
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
CREATE TABLE cash_movements (
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
CREATE TABLE inventory_movements (
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

-- IDEMPOTENCIA: evita doble descuento si se reintenta pago
CREATE UNIQUE INDEX idx_unique_auto_sale_per_order_item
  ON inventory_movements(item_id, ref_entity_id)
  WHERE type = 'auto_sale' AND ref_entity_id IS NOT NULL AND deleted_at IS NULL;

-- Gastos
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Logs de auditoría (nunca se elimina)
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL, -- Flexible for 'close_register', etc.
  entity text NOT NULL CHECK (entity IN ('order', 'payment', 'cash_register', 'cash_movement', 'inventory', 'product')),
  entity_id uuid NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_logs_business_created ON audit_logs(business_id, created_at DESC);

-- =============================================
-- INDEXES
-- =============================================

-- Performance indexes
CREATE INDEX idx_products_business ON products(business_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_business_status ON orders(business_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_payments_cash_register ON payments(cash_register_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_cash_registers_business_status ON cash_registers(business_id, status) WHERE deleted_at IS NULL;

-- Constraint: Solo un payment 'paid' por order
CREATE UNIQUE INDEX idx_one_paid_per_order ON payments(order_id) 
  WHERE status = 'paid' AND deleted_at IS NULL;

-- Constraint: Solo un turno abierto por usuario (turno personal)
CREATE UNIQUE INDEX idx_one_open_register_per_user ON cash_registers(business_id, opened_by) 
  WHERE status = 'open' AND deleted_at IS NULL;

-- Índice para buscar turno del usuario actual
CREATE INDEX idx_cash_registers_user_status ON cash_registers(opened_by, status) 
  WHERE deleted_at IS NULL;

-- =============================================
-- FUNCTIONS
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
-- TRIGGERS
-- =============================================

-- Auto-update updated_at en orders
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Validar que CLOSED requiere payment paid
CREATE OR REPLACE FUNCTION check_order_close_requires_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CLOSED' AND OLD.status != 'CLOSED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM payments 
      WHERE order_id = NEW.id 
        AND status = 'paid' 
        AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot close order without a paid payment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_require_payment_for_close
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION check_order_close_requires_payment();

-- Validar que cash_register esté abierto al crear payment
CREATE OR REPLACE FUNCTION check_cash_register_open()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cash_registers 
    WHERE id = NEW.cash_register_id 
      AND status = 'open'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cash register must be open to create a payment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_require_open_register
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_cash_register_open();

-- Validar refund/void solo si hubo paid previo
CREATE OR REPLACE FUNCTION check_refund_void_requires_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('refunded', 'void') AND OLD.status != 'paid' THEN
    RAISE EXCEPTION 'Can only refund or void a paid payment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_refund_void_check
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_refund_void_requires_paid();

-- =============================================
-- INVENTORY RPC FUNCTION
-- =============================================

-- Funcion atomica para movimientos de inventario
-- Garantiza: consistencia + RBAC + proteccion cross-tenant + idempotencia
CREATE OR REPLACE FUNCTION apply_inventory_movement(
  p_item_id uuid,
  p_business_id uuid,
  p_type text,           -- 'manual_adjustment', 'purchase', 'auto_sale', 'waste'
  p_delta numeric,       -- positivo o negativo
  p_reason text,
  p_actor_user_id uuid,
  p_ref_order_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_item_business_id uuid;
  v_stock_min numeric;
  v_new_stock numeric;
  v_movement_id uuid;
  v_user_role text;
BEGIN
  -- 0. Bloquear item y obtener business_id real (proteccion cross-tenant)
  SELECT business_id, stock_min INTO v_item_business_id, v_stock_min
  FROM inventory_items
  WHERE id = p_item_id
  FOR UPDATE;
  
  IF v_item_business_id IS NULL THEN
    RAISE EXCEPTION 'Item no encontrado: %', p_item_id;
  END IF;
  
  -- Validar que p_business_id coincide (proteccion cross-tenant)
  IF v_item_business_id != p_business_id THEN
    RAISE EXCEPTION 'Item no pertenece al negocio especificado';
  END IF;
  
  -- 1. Obtener rol del usuario en este negocio
  SELECT role INTO v_user_role
  FROM business_memberships
  WHERE user_id = p_actor_user_id AND business_id = v_item_business_id;
  
  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no tiene acceso a este negocio';
  END IF;
  
  -- 2. RBAC: validar permisos segun tipo de movimiento
  IF p_type = 'auto_sale' THEN
    IF v_user_role NOT IN ('CASHIER', 'ADMIN', 'OWNER') THEN
      RAISE EXCEPTION 'Rol % no puede ejecutar auto_sale', v_user_role;
    END IF;
  ELSE
    IF v_user_role NOT IN ('INVENTORY', 'ADMIN', 'OWNER') THEN
      RAISE EXCEPTION 'Rol % no puede ejecutar %', v_user_role, p_type;
    END IF;
  END IF;
  
  -- 3. Actualizar stock (ya tenemos lock)
  UPDATE inventory_items
  SET stock_current = stock_current + p_delta
  WHERE id = p_item_id
  RETURNING stock_current INTO v_new_stock;
  
  -- 4. Registrar movimiento (usa business_id del item, no param)
  -- El unique constraint idx_unique_auto_sale_per_order_item previene duplicados
  INSERT INTO inventory_movements (
    item_id, business_id, type, delta, reason, 
    ref_entity_type, ref_entity_id, created_by
  ) VALUES (
    p_item_id, v_item_business_id, p_type, p_delta, p_reason,
    CASE WHEN p_ref_order_id IS NOT NULL THEN 'order' END,
    p_ref_order_id, p_actor_user_id
  )
  RETURNING id INTO v_movement_id;
  
  -- 5. Registrar en auditoria
  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_item_business_id, p_actor_user_id, 'update', 'inventory', p_item_id,
    jsonb_build_object(
      'type', p_type,
      'delta', p_delta,
      'new_stock', v_new_stock,
      'movement_id', v_movement_id,
      'actor_role', v_user_role
    )
  );
  
  -- 6. Return (is_low usa v_stock_min ya obtenido, sin SELECT extra)
  RETURN jsonb_build_object(
    'success', true,
    'new_stock', v_new_stock,
    'movement_id', v_movement_id,
    'is_low', v_new_stock <= v_stock_min
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revocar acceso directo, solo via RPC
REVOKE ALL ON FUNCTION apply_inventory_movement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_inventory_movement TO authenticated;

-- Indices de performance para inventory
CREATE INDEX idx_inventory_items_business_active 
  ON inventory_items(business_id, active) WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_movements_business_date 
  ON inventory_movements(business_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_inventory_movements_ref ON inventory_movements(ref_entity_type, ref_entity_id) 
  WHERE deleted_at IS NULL;

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

-- Política base: acceso solo a negocios donde el usuario es miembro
CREATE POLICY "tenant_isolation" ON businesses
  FOR ALL USING (
    id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON business_memberships
  FOR ALL USING (
    user_id = auth.uid()
  );

CREATE POLICY "tenant_isolation" ON categories
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON products
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON inventory_items
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON cash_registers
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON orders
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON order_items
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON payments
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON cash_movements
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON inventory_movements
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON expenses
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

CREATE POLICY "tenant_isolation" ON audit_logs
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- Permitir a usuarios autenticados crear su primer negocio
CREATE POLICY "users_can_create_business" ON businesses
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "users_can_create_membership" ON business_memberships
  FOR INSERT WITH CHECK (user_id = auth.uid());
