-- =============================================
-- GastroOS - Database Schema (CONSOLIDADO)
-- Sistema POS/SaaS para negocios de comida
-- =============================================
-- Este archivo reemplaza los 30 scripts históricos de /supabase
-- (movidos a /supabase/archive para referencia). Es la ÚNICA
-- fuente de verdad del schema: idempotente, puede correrse contra
-- una base de datos nueva de principio a fin sin pasos manuales.
--
-- Requiere: Postgres con el schema `auth` ya creado (self-hosted
-- Supabase / supabase/postgres docker image). Ejecutar como el rol
-- `postgres` (mismo rol que configura los default privileges de
-- anon/authenticated/service_role).
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLES
-- =============================================

-- Negocios (Multi-tenant)
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('taqueria', 'pizzeria', 'cafeteria', 'fast_food', 'other')),
  operation_mode text NOT NULL DEFAULT 'counter' CHECK (operation_mode IN ('counter', 'restaurant')),
  kitchen_enabled boolean NOT NULL DEFAULT true,
  permission_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  logo_url text,
  limits_products integer DEFAULT 100,
  limits_orders_day integer DEFAULT 200,
  limits_users integer DEFAULT 3,
  limits_storage_mb integer DEFAULT 50,
  default_keep_float_amount numeric(10,2) DEFAULT 150.00,
  cash_difference_threshold numeric(10,2) DEFAULT 20.00,
  deleted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN businesses.deleted_at IS 'Soft-delete: si no es NULL, el negocio está eliminado';
COMMENT ON COLUMN businesses.default_keep_float_amount IS 'Fondo sugerido para dejar en caja al cerrar turno';
COMMENT ON COLUMN businesses.cash_difference_threshold IS 'Umbral de diferencia para exigir notas de cierre';

-- Migración idempotente para bases ya desplegadas antes de este cambio.
-- Solo corre el backfill la primera vez (si la columna ya existe, no se
-- vuelve a tocar para no pisar el valor que un OWNER haya configurado a mano).
-- Debe ir ANTES del COMMENT de abajo: en una base ya existente la columna
-- todavía no existe hasta que este bloque la agrega.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'kitchen_enabled'
  ) THEN
    ALTER TABLE businesses ADD COLUMN kitchen_enabled boolean NOT NULL DEFAULT true;
    UPDATE businesses SET kitchen_enabled = (operation_mode = 'restaurant');
  END IF;
END $$;

COMMENT ON COLUMN businesses.kitchen_enabled IS 'Si el negocio usa la pantalla/flujo de Cocina. Por defecto true, pero se fija en false al crear negocios en operation_mode=counter (bar/mostrador) y es configurable por el OWNER en Configuración.';

-- Migración idempotente (mismo patrón que kitchen_enabled arriba)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'permission_overrides'
  ) THEN
    ALTER TABLE businesses ADD COLUMN permission_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

COMMENT ON COLUMN businesses.permission_overrides IS 'Roles adicionales (más allá de OWNER/ADMIN, que siempre pueden) autorizados por el OWNER para acciones sensibles. Formato: {"order:cancel": ["CASHIER"], "payment:void": [...], "payment:refund": [...]}. Ver set_kitchen_enabled/business_role_can.';

-- Membresías (Auth + Roles)
CREATE TABLE IF NOT EXISTS business_memberships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'CASHIER', 'KITCHEN', 'INVENTORY')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'disabled')),
  invited_email text,
  disabled_reason text,
  last_active_at timestamptz,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(business_id, user_id)
);

COMMENT ON COLUMN business_memberships.disabled_reason IS 'Razón de desactivación: business_deleted, admin, etc.';
COMMENT ON COLUMN business_memberships.last_active_at IS 'Última actividad del usuario — actualizado por heartbeat cada 60s';

-- Solo 1 membresía OWNER activa por usuario (race-condition safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_owner_per_user
  ON business_memberships(user_id)
  WHERE role = 'OWNER' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_business_memberships_invited_email
  ON business_memberships(invited_email) WHERE invited_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bm_last_active
  ON business_memberships(business_id, last_active_at DESC NULLS LAST);

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

-- Recetas: vincula productos con items de inventario
CREATE TABLE IF NOT EXISTS product_recipes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity numeric(10,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(product_id, inventory_item_id)
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
  keep_float_amount numeric(10,2),
  withdrawn_cash numeric(10,2),
  closing_notes text,
  expected_cash_snapshot numeric(10,2),
  requires_review boolean DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  count_breakdown jsonb,
  summary_snapshot jsonb,
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON COLUMN cash_registers.keep_float_amount IS 'Fondo dejado para siguiente turno';
COMMENT ON COLUMN cash_registers.withdrawn_cash IS 'Efectivo retirado al cerrar';
COMMENT ON COLUMN cash_registers.closing_notes IS 'Notas obligatorias si diferencia > threshold';
COMMENT ON COLUMN cash_registers.expected_cash_snapshot IS 'Snapshot histórico del efectivo esperado al cerrar';
COMMENT ON COLUMN cash_registers.requires_review IS 'Cierre requiere revisión de admin por diferencia';
COMMENT ON COLUMN cash_registers.count_breakdown IS 'Desglose de billetes/monedas: {"cash":{"500":2},"coins":{"10":2},"total":1020}';
COMMENT ON COLUMN cash_registers.summary_snapshot IS 'Fuente de verdad inmutable del resumen de cierre (jsonb)';

CREATE INDEX IF NOT EXISTS idx_cash_registers_business_opened ON cash_registers(business_id, opened_at DESC);

-- Órdenes
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  folio text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PREP', 'READY', 'PAID', 'DELIVERED', 'CLOSED', 'CANCELLED')),
  service_type text NOT NULL DEFAULT 'dine_in' CHECK (service_type IN ('dine_in', 'takeaway', 'delivery')),
  table_number text,
  subtotal_snapshot numeric(10,2),
  discount_amount numeric(10,2) DEFAULT 0,
  discount_reason text,
  tax_snapshot numeric(10,2) DEFAULT 0,
  total_snapshot numeric(10,2),
  notes text,
  cancel_reason text,
  cancelled_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Migración idempotente: amplía el CHECK de orders.status para bases ya
-- desplegadas donde el constraint se creó antes de agregar 'PAID'
-- (estado "cobrada, pendiente de finalizar/entregar" en modo mostrador).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('OPEN', 'IN_PREP', 'READY', 'PAID', 'DELIVERED', 'CLOSED', 'CANCELLED'));

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
  cash_register_id uuid REFERENCES cash_registers(id),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('cash', 'card', 'transfer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'void')),
  paid_at timestamptz,
  void_reason text,
  voided_at timestamptz,
  refund_reason text,
  refunded_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Movimientos de caja
CREATE TABLE IF NOT EXISTS cash_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  cash_register_id uuid NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('in', 'out')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Movimientos de inventario
CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('manual_adjustment', 'purchase', 'auto_sale', 'waste', 'refund', 'void')),
  delta numeric(10,3) NOT NULL,
  reason text,
  ref_entity_type text CHECK (ref_entity_type IN ('order', 'payment')),
  ref_entity_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- IDEMPOTENCIA: evita doble descuento/reversa (ref_entity_id = payment.id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_auto_sale_per_payment_item
  ON inventory_movements(ref_entity_id, item_id, type)
  WHERE type = 'auto_sale';

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_refund_void_per_payment_item
  ON inventory_movements(ref_entity_id, item_id, type)
  WHERE type IN ('refund', 'void');

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

-- Logs de auditoría (nunca se elimina)
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  entity text NOT NULL CHECK (entity IN ('order', 'payment', 'cash_register', 'cash_movement', 'inventory', 'product', 'subscription', 'business')),
  entity_id uuid NOT NULL,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created ON audit_logs(business_id, created_at DESC);

-- Perfiles (términos y condiciones)
CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_terms_at timestamptz,
  accepted_terms_version text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Admins de plataforma (whitelist)
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  email text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Usuarios bloqueados a nivel plataforma (source of truth)
CREATE TABLE IF NOT EXISTS blocked_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  blocked_by uuid REFERENCES auth.users(id),
  business_id uuid REFERENCES businesses(id),
  notes text
);

COMMENT ON TABLE blocked_users IS 'Usuarios bloqueados: source of truth para denegar acceso al sistema';
COMMENT ON COLUMN blocked_users.business_id IS 'Negocio asociado al bloqueo (para desbloquear al restaurar negocio)';

-- Planes (catálogo, seed abajo)
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'MXN',
  billing_interval text NOT NULL CHECK (billing_interval IN ('trial', 'monthly', 'annual')),
  features jsonb DEFAULT '{}'::jsonb,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Suscripciones (1 por negocio)
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'expired', 'canceled', 'suspended')),
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  trial_end timestamptz,
  plan_code_snapshot text NOT NULL,
  price_snapshot numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  billing_interval text NOT NULL,
  scheduled_plan_slug text,
  scheduled_plan_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  assigned_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN subscriptions.scheduled_plan_slug IS 'Plan que se aplicará al final del periodo actual';
COMMENT ON COLUMN subscriptions.scheduled_plan_at IS 'Fecha en que se programó el cambio';

-- =============================================
-- SEED: Planes iniciales
-- =============================================

INSERT INTO plans (slug, name, price, currency, billing_interval, features) VALUES
  ('demo', 'Demo (5 días)', 0, 'MXN', 'trial', jsonb_build_object(
    'limits_products', 100,
    'limits_orders_day', 200,
    'limits_users', 3,
    'limits_storage_mb', 50
  )),
  ('basic', 'Básico', 69, 'MXN', 'monthly', jsonb_build_object(
    'limits_products', 10,
    'limits_orders_day', 100,
    'limits_users', 2,
    'limits_storage_mb', 25
  )),
  ('premium_monthly', 'Premium Mensual', 120, 'MXN', 'monthly', jsonb_build_object(
    'limits_products', 500,
    'limits_orders_day', 1000,
    'limits_users', 10,
    'limits_storage_mb', 200
  )),
  ('premium_annual', 'Premium Anual', 1200, 'MXN', 'annual', jsonb_build_object(
    'limits_products', 500,
    'limits_orders_day', 1000,
    'limits_users', 10,
    'limits_storage_mb', 200
  ))
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_business_status ON orders(business_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_cash_register ON payments(cash_register_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cash_registers_business_status ON cash_registers(business_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_register_paid ON payments(cash_register_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_register_created ON cash_movements(cash_register_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_limit_day ON payments(business_id, paid_at) WHERE status = 'paid' AND deleted_at IS NULL;

-- Migración idempotente: este índice único bloqueaba los pagos parciales
-- (una cuenta/orden puede tener varios pagos 'paid' — uno por abono — como
-- ya asume el POS al sumar payments.amount para calcular lo ya pagado).
-- Con el índice, el segundo abono fallaba con "duplicate key". Se quita.
DROP INDEX IF EXISTS idx_one_paid_per_order;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_register_per_user ON cash_registers(business_id, opened_by)
  WHERE status = 'open' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cash_registers_user_status ON cash_registers(opened_by, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_business_active
  ON inventory_items(business_id, active) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_business_date
  ON inventory_movements(business_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref ON inventory_movements(ref_entity_type, ref_entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_recipes_product ON product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_business ON product_recipes(business_id);

-- =============================================
-- FUNCTIONS — generales
-- =============================================

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

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION check_refund_void_requires_paid()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('refunded', 'void') AND OLD.status != 'paid' THEN
    RAISE EXCEPTION 'Can only refund or void a paid payment';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- FUNCTIONS — inventario
-- =============================================

CREATE OR REPLACE FUNCTION apply_inventory_movement(
  p_item_id uuid,
  p_business_id uuid,
  p_type text,
  p_delta numeric,
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
  SELECT business_id, stock_min INTO v_item_business_id, v_stock_min
  FROM inventory_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item_business_id IS NULL THEN
    RAISE EXCEPTION 'Item no encontrado: %', p_item_id;
  END IF;

  IF v_item_business_id != p_business_id THEN
    RAISE EXCEPTION 'Item no pertenece al negocio especificado';
  END IF;

  SELECT role INTO v_user_role
  FROM business_memberships
  WHERE user_id = p_actor_user_id AND business_id = v_item_business_id;

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'Usuario no tiene acceso a este negocio';
  END IF;

  IF p_type = 'auto_sale' THEN
    IF v_user_role NOT IN ('CASHIER', 'ADMIN', 'OWNER') THEN
      RAISE EXCEPTION 'Rol % no puede ejecutar auto_sale', v_user_role;
    END IF;
  ELSE
    IF v_user_role NOT IN ('INVENTORY', 'ADMIN', 'OWNER') THEN
      RAISE EXCEPTION 'Rol % no puede ejecutar %', v_user_role, p_type;
    END IF;
  END IF;

  UPDATE inventory_items
  SET stock_current = stock_current + p_delta
  WHERE id = p_item_id
  RETURNING stock_current INTO v_new_stock;

  INSERT INTO inventory_movements (
    item_id, business_id, type, delta, reason,
    ref_entity_type, ref_entity_id, created_by
  ) VALUES (
    p_item_id, v_item_business_id, p_type, p_delta, p_reason,
    CASE WHEN p_ref_order_id IS NOT NULL THEN 'order' END,
    p_ref_order_id, p_actor_user_id
  )
  RETURNING id INTO v_movement_id;

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

  RETURN jsonb_build_object(
    'success', true,
    'new_stock', v_new_stock,
    'movement_id', v_movement_id,
    'is_low', v_new_stock <= v_stock_min
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION apply_inventory_movement FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_inventory_movement TO authenticated;

-- Auto-descuento de inventario al recibir un pago (ref_entity_id = payment.id)
CREATE OR REPLACE FUNCTION auto_deduct_inventory_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_new_stock numeric;
  v_movement_id uuid;
  v_order_folio text;
BEGIN
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;

  -- El inventario de una orden se descuenta UNA sola vez, sin importar
  -- cuántos pagos parciales (abonos) termine teniendo esa orden — por eso
  -- este guard se revisa por ORDEN (vía los pagos ya existentes de esa
  -- orden), no solo por este pago puntual (NEW.id siempre es nuevo en un
  -- INSERT, así que revisar solo NEW.id nunca evitaba el doble descuento).
  IF EXISTS (
    SELECT 1
    FROM inventory_movements im
    JOIN payments p ON p.id = im.ref_entity_id
    WHERE p.order_id = NEW.order_id
      AND im.type = 'auto_sale'
      AND im.deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  SELECT folio INTO v_order_folio FROM orders WHERE id = NEW.order_id;

  FOR r IN
    SELECT
      oi.quantity,
      p.inventory_item_id,
      p.name AS product_name
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN inventory_items ii ON ii.id = p.inventory_item_id
    WHERE oi.order_id = NEW.order_id
      AND p.inventory_item_id IS NOT NULL
      AND ii.track_mode = 'auto'
      AND ii.deleted_at IS NULL
  LOOP
    PERFORM 1 FROM inventory_items WHERE id = r.inventory_item_id FOR UPDATE;

    UPDATE inventory_items
    SET stock_current = stock_current - r.quantity
    WHERE id = r.inventory_item_id
    RETURNING stock_current INTO v_new_stock;

    INSERT INTO inventory_movements (
      item_id, business_id, type, delta, ref_entity_id, reason, created_by
    ) VALUES (
      r.inventory_item_id, NEW.business_id, 'auto_sale',
      -r.quantity, NEW.id,
      'Venta orden ' || COALESCE(v_order_folio, NEW.order_id::text),
      NEW.created_by
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_movement_id;

    IF v_movement_id IS NOT NULL THEN
      INSERT INTO audit_logs (
        business_id, actor_user_id, action, entity, entity_id, metadata
      ) VALUES (
        NEW.business_id, NEW.created_by, 'auto_sale', 'inventory',
        r.inventory_item_id,
        jsonb_build_object(
          'type', 'auto_sale',
          'product', r.product_name,
          'delta', -r.quantity,
          'new_stock', v_new_stock,
          'movement_id', v_movement_id,
          'payment_id', NEW.id,
          'order_id', NEW.order_id,
          'folio', v_order_folio
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Reversión de inventario al refund/void (ref_entity_id = payment.id)
CREATE OR REPLACE FUNCTION reverse_inventory_on_refund_void()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_folio text;
  r record;
  v_movement_id uuid;
  v_new_stock numeric;
BEGIN
  IF OLD.status = 'paid' AND NEW.status IN ('refunded', 'void') THEN

    SELECT folio INTO v_order_folio FROM orders WHERE id = NEW.order_id;

    FOR r IN
      SELECT
        oi.id as order_item_id,
        oi.product_id,
        oi.quantity,
        oi.name_snapshot as product_name,
        p.inventory_item_id
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.order_id
    LOOP
      IF r.inventory_item_id IS NOT NULL THEN
        INSERT INTO inventory_movements (
          business_id, item_id, type, delta, ref_entity_id, reason, created_by
        ) VALUES (
          NEW.business_id, r.inventory_item_id,
          CASE WHEN NEW.status = 'refunded' THEN 'refund' ELSE 'void' END,
          r.quantity, NEW.id,
          format('Reversa %s - %s - Folio: %s',
            CASE WHEN NEW.status = 'refunded' THEN 'Refund' ELSE 'Void' END,
            r.product_name, v_order_folio),
          NEW.created_by
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_movement_id;

        IF v_movement_id IS NOT NULL THEN
          UPDATE inventory_items
          SET stock_current = stock_current + r.quantity
          WHERE id = r.inventory_item_id
          RETURNING stock_current INTO v_new_stock;

          INSERT INTO audit_logs (
            business_id, actor_user_id, action, entity, entity_id, metadata
          ) VALUES (
            NEW.business_id, NEW.created_by,
            CASE WHEN NEW.status = 'refunded' THEN 'refund' ELSE 'void' END,
            'inventory', r.inventory_item_id,
            jsonb_build_object(
              'type', CASE WHEN NEW.status = 'refunded' THEN 'refund' ELSE 'void' END,
              'product', r.product_name,
              'delta', r.quantity,
              'new_stock', v_new_stock,
              'movement_id', v_movement_id,
              'payment_id', NEW.id,
              'order_id', NEW.order_id,
              'folio', v_order_folio,
              'reason', CASE WHEN NEW.status = 'refunded' THEN NEW.refund_reason ELSE NEW.void_reason END
            )
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================
-- FUNCTIONS — órdenes / pagos (cancel, void, refund)
-- =============================================

CREATE OR REPLACE FUNCTION cancel_order(
  p_order_id uuid,
  p_cancel_reason text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_payment record;
  v_actor_user_id uuid;
  v_role text;
BEGIN
  -- p_user_id se ignora para fines de autorización/auditoría: nunca se
  -- confía en lo que manda el cliente. El actor real sale de la sesión.
  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  SELECT role INTO v_role
  FROM business_memberships
  WHERE business_id = v_order.business_id AND user_id = v_actor_user_id AND status = 'active';

  IF v_role IS NULL OR NOT business_role_can(v_order.business_id, v_role, 'order:cancel') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_order.status NOT IN ('OPEN', 'IN_PREP') THEN
    RAISE EXCEPTION 'Order cannot be cancelled in status: %', v_order.status;
  END IF;

  SELECT * INTO v_payment
  FROM payments
  WHERE order_id = p_order_id
    AND status = 'paid'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Cannot cancel paid order. Use refund/void instead.';
  END IF;

  UPDATE orders
  SET
    status = 'CANCELLED',
    cancel_reason = p_cancel_reason,
    cancelled_at = NOW(),
    updated_at = NOW()
  WHERE id = p_order_id;

  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_order.business_id,
    v_actor_user_id,
    'cancel',
    'order',
    p_order_id,
    jsonb_build_object(
      'reason', p_cancel_reason,
      'folio', v_order.folio,
      'previous_status', v_order.status
    )
  );

  RETURN json_build_object('success', true, 'folio', v_order.folio);
END;
$$;

REVOKE ALL ON FUNCTION cancel_order FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_order TO authenticated;

CREATE OR REPLACE FUNCTION void_payment(
  p_payment_id uuid,
  p_void_reason text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment record;
  v_order record;
  v_current_cash_register uuid;
  v_actor_user_id uuid;
  v_role text;
BEGIN
  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT role INTO v_role
  FROM business_memberships
  WHERE business_id = v_payment.business_id AND user_id = v_actor_user_id AND status = 'active';

  IF v_role IS NULL OR NOT business_role_can(v_payment.business_id, v_role, 'payment:void') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_payment.status != 'paid' THEN
    RAISE EXCEPTION 'Only paid payments can be voided. Current status: %', v_payment.status;
  END IF;

  SELECT id INTO v_current_cash_register
  FROM cash_registers
  WHERE business_id = v_payment.business_id
    AND status = 'open'
  LIMIT 1;

  IF v_current_cash_register IS NULL THEN
    RAISE EXCEPTION 'No open cash register found. Use refund instead.';
  END IF;

  IF v_current_cash_register != v_payment.cash_register_id THEN
    RAISE EXCEPTION 'Can only void payments from current open cash register. Use refund instead.';
  END IF;

  UPDATE payments
  SET
    status = 'void',
    void_reason = p_void_reason,
    voided_at = NOW(),
    updated_at = NOW()
  WHERE id = p_payment_id;

  SELECT * INTO v_order FROM orders WHERE id = v_payment.order_id;

  UPDATE orders
  SET
    status = 'CANCELLED',
    updated_at = NOW()
  WHERE id = v_payment.order_id;

  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_payment.business_id,
    v_actor_user_id,
    'void',
    'payment',
    p_payment_id,
    jsonb_build_object(
      'reason', p_void_reason,
      'order_id', v_payment.order_id,
      'folio', v_order.folio,
      'amount', v_payment.amount,
      'method', v_payment.method
    )
  );

  RETURN json_build_object('success', true, 'folio', v_order.folio);
END;
$$;

REVOKE ALL ON FUNCTION void_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_payment TO authenticated;

CREATE OR REPLACE FUNCTION refund_payment(
  p_payment_id uuid,
  p_refund_reason text,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment record;
  v_order record;
  v_current_cash_register uuid;
  v_actor_user_id uuid;
  v_role text;
BEGIN
  v_actor_user_id := auth.uid();
  IF v_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT role INTO v_role
  FROM business_memberships
  WHERE business_id = v_payment.business_id AND user_id = v_actor_user_id AND status = 'active';

  IF v_role IS NULL OR NOT business_role_can(v_payment.business_id, v_role, 'payment:refund') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF v_payment.status != 'paid' THEN
    RAISE EXCEPTION 'Only paid payments can be refunded. Current status: %', v_payment.status;
  END IF;

  SELECT id INTO v_current_cash_register
  FROM cash_registers
  WHERE business_id = v_payment.business_id
    AND status = 'open'
  LIMIT 1;

  IF v_current_cash_register IS NOT NULL AND v_current_cash_register = v_payment.cash_register_id THEN
    RAISE EXCEPTION 'Cannot refund payment from current open cash register. Use void instead.';
  END IF;

  UPDATE payments
  SET
    status = 'refunded',
    refund_reason = p_refund_reason,
    refunded_at = NOW(),
    updated_at = NOW()
  WHERE id = p_payment_id;

  SELECT * INTO v_order FROM orders WHERE id = v_payment.order_id;

  UPDATE orders
  SET
    status = 'CANCELLED',
    updated_at = NOW()
  WHERE id = v_payment.order_id;

  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_payment.business_id,
    v_actor_user_id,
    'refund',
    'payment',
    p_payment_id,
    jsonb_build_object(
      'reason', p_refund_reason,
      'order_id', v_payment.order_id,
      'folio', v_order.folio,
      'amount', v_payment.amount,
      'method', v_payment.method
    )
  );

  RETURN json_build_object('success', true, 'folio', v_order.folio);
END;
$$;

REVOKE ALL ON FUNCTION refund_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refund_payment TO authenticated;

-- =============================================
-- FUNCTIONS — cierre de caja (versión hardened)
-- =============================================

CREATE OR REPLACE FUNCTION get_cash_register_summary(
  p_cash_register_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_register record;
  v_sales_by_method jsonb;
  v_cash_in numeric := 0;
  v_cash_out numeric := 0;
  v_voids_by_method jsonb;
  v_refunds_by_method jsonb;
  v_expected_cash numeric := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_orphan_count integer := 0;
  v_pending_count integer := 0;
  v_period_end timestamptz;
BEGIN
  SELECT * INTO v_register FROM cash_registers WHERE id = p_cash_register_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cash register not found'; END IF;

  v_period_end := COALESCE(v_register.closed_at, NOW());

  SELECT jsonb_object_agg(method, total)
  INTO v_sales_by_method
  FROM (
    SELECT method, COALESCE(SUM(amount), 0) as total
    FROM payments
    WHERE cash_register_id = p_cash_register_id
    AND status = 'paid'
    GROUP BY method
  ) t;

  SELECT
    COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'out' AND reason != 'Retiro de Cierre' THEN amount ELSE 0 END), 0)
  INTO v_cash_in, v_cash_out
  FROM cash_movements
  WHERE cash_register_id = p_cash_register_id
  AND deleted_at IS NULL;

  SELECT jsonb_object_agg(method, total) INTO v_voids_by_method
  FROM (
        SELECT method, COALESCE(SUM(amount), 0) as total
        FROM payments WHERE cash_register_id = p_cash_register_id AND status = 'void' GROUP BY method
  ) t;

  SELECT jsonb_object_agg(method, total) INTO v_refunds_by_method
  FROM (
        SELECT method, COALESCE(SUM(amount), 0) as total
        FROM payments WHERE cash_register_id = p_cash_register_id AND status = 'refunded' GROUP BY method
  ) t;

  v_expected_cash := v_register.opening_amount
    + COALESCE((v_sales_by_method->>'cash')::numeric, 0)
    + v_cash_in
    - v_cash_out
    - COALESCE((v_refunds_by_method->>'cash')::numeric, 0)
    - COALESCE((v_voids_by_method->>'cash')::numeric, 0);

  SELECT COUNT(*) INTO v_orphan_count
  FROM payments
  WHERE business_id = v_register.business_id
    AND cash_register_id IS NULL
    AND status = 'paid'
    AND paid_at BETWEEN v_register.opened_at AND v_period_end;

  IF v_orphan_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'orphan_payment_cash_register',
      'severity', 'info',
      'message', format('%s pagos sin caja asignada en este periodo', v_orphan_count),
      'count', v_orphan_count
    );
  END IF;

  SELECT COUNT(*) INTO v_pending_count
  FROM payments
  WHERE cash_register_id = p_cash_register_id AND status = 'pending';

  IF v_pending_count > 0 THEN
    v_warnings := v_warnings || jsonb_build_object(
      'type', 'pending_payments',
      'severity', 'warn',
      'message', format('%s pagos pendientes en esta caja', v_pending_count),
      'count', v_pending_count
    );
  END IF;

  RETURN jsonb_build_object(
    'version', 1,
    'generated_at', NOW(),
    'register_id', p_cash_register_id,
    'period', jsonb_build_object('opened_at', v_register.opened_at, 'closed_at', v_register.closed_at),
    'totals', jsonb_build_object(
        'sales_by_method', COALESCE(v_sales_by_method, '{}'::jsonb),
        'cash_in', v_cash_in,
        'cash_out', v_cash_out,
        'refunds_by_method', COALESCE(v_refunds_by_method, '{}'::jsonb),
        'voids_by_method', COALESCE(v_voids_by_method, '{}'::jsonb)
    ),
    'expected_cash', v_expected_cash,
    'start_amount', v_register.opening_amount,
    'warnings', v_warnings
  );
END;
$$;

CREATE OR REPLACE FUNCTION close_cash_register(
  p_cash_register_id uuid,
  p_counted_cash numeric,
  p_keep_float_amount numeric,
  p_closing_notes text DEFAULT NULL,
  p_count_breakdown jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_register record;
  v_business record;
  v_summary jsonb;
  v_expected_cash numeric;
  v_difference numeric;
  v_threshold numeric;
  v_withdrawn_cash numeric;
  v_requires_review boolean := false;
  v_user_id uuid;
  v_breakdown_total numeric := 0;
BEGIN
  v_user_id := auth.uid();

  SELECT * INTO v_register
  FROM cash_registers
  WHERE id = p_cash_register_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Cash register not found'; END IF;
  IF v_register.status != 'open' THEN RAISE EXCEPTION 'Cash register is already closed'; END IF;

  IF p_count_breakdown IS NOT NULL THEN
     v_breakdown_total := v_breakdown_total + COALESCE((
        SELECT SUM(key::numeric * value::numeric)
        FROM jsonb_each_text(p_count_breakdown->'cash')
     ), 0);

     v_breakdown_total := v_breakdown_total + COALESCE((
        SELECT SUM(key::numeric * value::numeric)
        FROM jsonb_each_text(p_count_breakdown->'coins')
     ), 0);

     IF p_count_breakdown ? 'total' AND (p_count_breakdown->>'total')::numeric != p_counted_cash THEN
        RAISE EXCEPTION 'Breakdown total property (%) does not match counted cash input (%)',
            (p_count_breakdown->>'total'), p_counted_cash;
     END IF;

     IF v_breakdown_total != p_counted_cash THEN
          RAISE EXCEPTION 'Calculated breakdown total (%) does not match counted cash (%)', v_breakdown_total, p_counted_cash;
     END IF;
  END IF;

  SELECT * INTO v_business FROM businesses WHERE id = v_register.business_id;
  v_threshold := COALESCE(v_business.cash_difference_threshold, 20.00);

  v_summary := get_cash_register_summary(p_cash_register_id);
  v_expected_cash := (v_summary->>'expected_cash')::numeric;
  v_difference := p_counted_cash - v_expected_cash;

  v_requires_review := (ABS(v_difference) > v_threshold);

  IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_summary->'warnings') w
      WHERE w->>'severity' = 'critical'
  ) THEN
      v_requires_review := true;
  END IF;

  IF v_requires_review AND (p_closing_notes IS NULL OR length(trim(p_closing_notes)) = 0) THEN
       RAISE EXCEPTION 'Closing notes are mandatory when review is required (Difference > % or Critical Warnings)', v_threshold;
  END IF;

  v_withdrawn_cash := GREATEST(0, p_counted_cash - p_keep_float_amount);

  v_summary := v_summary || jsonb_build_object(
      'counted_cash', p_counted_cash,
      'difference', v_difference,
      'keep_float_amount', p_keep_float_amount,
      'withdrawn_cash', v_withdrawn_cash,
      'closing_notes', p_closing_notes
  );

  UPDATE cash_registers
  SET
    status = 'closed',
    closed_at = NOW(),
    closed_by = v_user_id,
    counted_cash = p_counted_cash,
    expected_cash_snapshot = v_expected_cash,
    keep_float_amount = p_keep_float_amount,
    withdrawn_cash = v_withdrawn_cash,
    closing_notes = p_closing_notes,
    requires_review = v_requires_review,
    count_breakdown = p_count_breakdown,
    summary_snapshot = v_summary,
    updated_at = NOW()
  WHERE id = p_cash_register_id;

  IF v_withdrawn_cash > 0 THEN
    INSERT INTO cash_movements (
      business_id, cash_register_id, type, amount, reason, created_by
    ) VALUES (
      v_register.business_id, p_cash_register_id, 'out', v_withdrawn_cash, 'Retiro de Cierre', v_user_id
    );
  END IF;

  INSERT INTO audit_logs (
    business_id, actor_user_id, action, entity, entity_id, metadata
  ) VALUES (
    v_register.business_id,
    v_user_id,
    'close_register',
    'cash_register',
    p_cash_register_id,
    jsonb_build_object(
        'summary_snapshot', v_summary,
        'actor', v_user_id,
        'requires_review', v_requires_review
    )
  );

  RETURN v_summary;
END;
$$;

-- =============================================
-- FUNCTIONS — triggers de límites de plan (RBAC)
-- =============================================

CREATE OR REPLACE FUNCTION enforce_product_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_limit INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text || '_products'));

  SELECT COUNT(*) INTO current_count
    FROM products
    WHERE business_id = NEW.business_id
      AND deleted_at IS NULL;

  SELECT COALESCE(limits_products, 100) INTO max_limit
    FROM businesses
    WHERE id = NEW.business_id;

  IF current_count >= max_limit THEN
    RAISE EXCEPTION 'Límite de productos alcanzado (% de %)', current_count, max_limit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION enforce_daily_payment_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_limit INT;
BEGIN
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;

  IF NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text || '_payments'));

  SELECT COUNT(*) INTO current_count
    FROM payments
    WHERE business_id = NEW.business_id
      AND status = 'paid'
      AND paid_at >= date_trunc('day', now())
      AND deleted_at IS NULL;

  SELECT COALESCE(limits_orders_day, 200) INTO max_limit
    FROM businesses
    WHERE id = NEW.business_id;

  IF current_count >= max_limit THEN
    RAISE EXCEPTION 'Límite diario de ventas alcanzado (% de %)', current_count, max_limit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION enforce_user_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_limit INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text || '_users'));

  SELECT COUNT(*) INTO current_count
    FROM business_memberships
    WHERE business_id = NEW.business_id
      AND deleted_at IS NULL;

  SELECT COALESCE(limits_users, 3) INTO max_limit
    FROM businesses
    WHERE id = NEW.business_id;

  IF current_count >= max_limit THEN
    RAISE EXCEPTION 'Límite de usuarios alcanzado (% de %)', current_count, max_limit;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- =============================================
-- FUNCTIONS — onboarding / planes / trial
-- =============================================

-- Copia los límites del plan al negocio
CREATE OR REPLACE FUNCTION apply_plan_limits_to_business(
  p_business_id uuid,
  p_plan_id uuid
)
RETURNS void AS $$
DECLARE
  v_features jsonb;
BEGIN
  SELECT features INTO v_features FROM plans WHERE id = p_plan_id;

  IF v_features IS NULL THEN
    RAISE EXCEPTION 'Plan no encontrado: %', p_plan_id;
  END IF;

  UPDATE businesses SET
    limits_products   = COALESCE((v_features->>'limits_products')::int, 100),
    limits_orders_day = COALESCE((v_features->>'limits_orders_day')::int, 200),
    limits_users      = COALESCE((v_features->>'limits_users')::int, 3)
  WHERE id = p_business_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION apply_plan_limits_to_business FROM PUBLIC;

-- RPC transaccional de onboarding: crea negocio + OWNER + trial + límites
-- (versión final: incluye check de blocked_users)
CREATE OR REPLACE FUNCTION create_business_and_owner_membership(
  p_name text,
  p_type text,
  p_operation_mode text
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_business_id uuid;
  v_demo_plan_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'AUTH_ERROR', 'message', 'No autenticado');
  END IF;

  IF EXISTS (SELECT 1 FROM blocked_users WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCOUNT_BLOCKED', 'message', 'Tu cuenta fue bloqueada. Contacta soporte.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM business_memberships
    WHERE user_id = v_user_id
      AND role = 'OWNER'
      AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_HAS_BUSINESS', 'message', 'Ya tienes un negocio registrado');
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'El nombre del negocio es requerido');
  END IF;

  IF p_type NOT IN ('taqueria', 'pizzeria', 'cafeteria', 'fast_food', 'other') THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Tipo de negocio no válido: ' || coalesce(p_type, 'null'));
  END IF;

  IF p_operation_mode NOT IN ('counter', 'restaurant') THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Modo de operación no válido: ' || coalesce(p_operation_mode, 'null'));
  END IF;

  SELECT id INTO v_demo_plan_id FROM plans WHERE slug = 'demo' AND active = true;
  IF v_demo_plan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', 'Plan demo no encontrado. Contacta soporte.');
  END IF;

  INSERT INTO businesses (name, type, operation_mode, kitchen_enabled)
  VALUES (trim(p_name), p_type, p_operation_mode, p_operation_mode = 'restaurant')
  RETURNING id INTO v_business_id;

  INSERT INTO business_memberships (business_id, user_id, role, status)
  VALUES (v_business_id, v_user_id, 'OWNER', 'active');

  INSERT INTO folio_sequences (business_id, last_folio)
  VALUES (v_business_id, 0)
  ON CONFLICT (business_id) DO NOTHING;

  INSERT INTO subscriptions (
    business_id, plan_id, status,
    current_period_start, current_period_end, trial_end,
    plan_code_snapshot, price_snapshot, currency, billing_interval,
    created_by
  ) VALUES (
    v_business_id, v_demo_plan_id, 'trialing',
    now(), now() + interval '5 days', now() + interval '5 days',
    'demo', 0, 'MXN', 'trial',
    v_user_id
  );

  PERFORM apply_plan_limits_to_business(v_business_id, v_demo_plan_id);

  RETURN jsonb_build_object(
    'success', true,
    'code', 'CREATED',
    'message', 'Negocio creado con prueba gratuita de 5 días',
    'business_id', v_business_id,
    'business_name', trim(p_name)
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_HAS_BUSINESS', 'message', 'Ya tienes un negocio registrado (intento duplicado)');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_business_and_owner_membership FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_business_and_owner_membership TO authenticated;

CREATE OR REPLACE FUNCTION get_subscription_status(p_business_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_sub record;
BEGIN
  SELECT
    s.id, s.status, s.trial_end, s.current_period_end,
    s.plan_code_snapshot, s.price_snapshot, s.notes
  INTO v_sub
  FROM subscriptions s
  WHERE s.business_id = p_business_id;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('has_subscription', false, 'is_active', false, 'status', 'none');
  END IF;

  IF v_sub.status = 'trialing' AND v_sub.trial_end < now() THEN
    UPDATE subscriptions
    SET status = 'expired', updated_at = now()
    WHERE id = v_sub.id;

    RETURN jsonb_build_object(
      'has_subscription', true,
      'is_active', false,
      'status', 'expired',
      'plan_code', v_sub.plan_code_snapshot,
      'trial_end', v_sub.trial_end,
      'notes', v_sub.notes
    );
  END IF;

  RETURN jsonb_build_object(
    'has_subscription', true,
    'is_active', v_sub.status IN ('trialing', 'active'),
    'status', v_sub.status,
    'plan_code', v_sub.plan_code_snapshot,
    'trial_end', v_sub.trial_end,
    'current_period_end', v_sub.current_period_end,
    'notes', v_sub.notes
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION get_subscription_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_subscription_status TO authenticated;

CREATE OR REPLACE FUNCTION change_business_plan(
  p_business_id uuid,
  p_plan_slug text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_plan record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'AUTH_ERROR', 'message', 'No autenticado');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM business_memberships
    WHERE business_id = p_business_id AND user_id = v_user_id AND role = 'OWNER'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No eres dueño de este negocio');
  END IF;

  SELECT id, slug, price, billing_interval INTO v_plan
  FROM plans
  WHERE slug = p_plan_slug AND active = true;

  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Plan no encontrado: ' || coalesce(p_plan_slug, 'null'));
  END IF;

  UPDATE subscriptions SET
    plan_id = v_plan.id,
    status = 'active',
    plan_code_snapshot = v_plan.slug,
    price_snapshot = v_plan.price,
    billing_interval = v_plan.billing_interval,
    current_period_start = now(),
    current_period_end = CASE
      WHEN v_plan.billing_interval = 'monthly' THEN now() + interval '1 month'
      WHEN v_plan.billing_interval = 'annual' THEN now() + interval '1 year'
      ELSE now() + interval '1 month'
    END,
    trial_end = NULL,
    assigned_by = v_user_id,
    notes = p_notes,
    updated_at = now()
  WHERE business_id = p_business_id;

  PERFORM apply_plan_limits_to_business(p_business_id, v_plan.id);

  RETURN jsonb_build_object('success', true, 'code', 'PLAN_CHANGED', 'message', 'Plan actualizado a ' || v_plan.slug, 'plan_code', v_plan.slug);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION change_business_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION change_business_plan TO authenticated;

CREATE OR REPLACE FUNCTION set_kitchen_enabled(
  p_business_id uuid,
  p_enabled boolean
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'AUTH_ERROR', 'message', 'No autenticado');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM business_memberships
    WHERE business_id = p_business_id AND user_id = v_user_id AND role = 'OWNER' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No eres dueño de este negocio');
  END IF;

  UPDATE businesses SET kitchen_enabled = p_enabled WHERE id = p_business_id;

  RETURN jsonb_build_object('success', true, 'code', 'KITCHEN_SETTING_UPDATED', 'kitchen_enabled', p_enabled);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION set_kitchen_enabled FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_kitchen_enabled TO authenticated;

-- Roles que siempre pueden (OWNER/ADMIN) + roles adicionales que el OWNER
-- haya autorizado en businesses.permission_overrides para esa acción puntual.
CREATE OR REPLACE FUNCTION business_role_can(
  p_business_id uuid,
  p_role text,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    p_role IN ('OWNER', 'ADMIN')
    OR EXISTS (
      SELECT 1 FROM businesses
      WHERE id = p_business_id
        AND permission_overrides -> p_permission ? p_role
    );
$$;

REVOKE ALL ON FUNCTION business_role_can FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_role_can TO authenticated;

CREATE OR REPLACE FUNCTION set_permission_override(
  p_business_id uuid,
  p_permission text,
  p_roles text[]
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'AUTH_ERROR', 'message', 'No autenticado');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM business_memberships
    WHERE business_id = p_business_id AND user_id = v_user_id AND role = 'OWNER' AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No eres dueño de este negocio');
  END IF;

  IF p_permission NOT IN ('order:cancel', 'payment:void', 'payment:refund') THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Permiso no configurable: ' || coalesce(p_permission, 'null'));
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_roles) r WHERE r NOT IN ('CASHIER', 'KITCHEN', 'INVENTORY')) THEN
    RETURN jsonb_build_object('success', false, 'code', 'VALIDATION_ERROR', 'message', 'Rol no asignable en overrides');
  END IF;

  UPDATE businesses
  SET permission_overrides = jsonb_set(permission_overrides, ARRAY[p_permission], to_jsonb(p_roles))
  WHERE id = p_business_id;

  RETURN jsonb_build_object('success', true, 'code', 'PERMISSION_UPDATED', 'permission', p_permission, 'roles', p_roles);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION set_permission_override FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_permission_override TO authenticated;

-- =============================================
-- FUNCTIONS — bloqueo de usuarios
-- =============================================

CREATE OR REPLACE FUNCTION is_user_blocked()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM blocked_users WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION is_user_blocked FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_user_blocked TO authenticated;

-- =============================================
-- FUNCTIONS — admin de plataforma
-- =============================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION is_admin FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_admin TO authenticated;

-- Helper RLS: negocios activos (no eliminados) del usuario actual
CREATE OR REPLACE FUNCTION active_business_ids_for_user()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT bm.business_id
  FROM business_memberships bm
  JOIN businesses b ON b.id = bm.business_id
  WHERE bm.user_id = auth.uid()
    AND b.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION admin_assign_plan(
  p_business_id uuid,
  p_plan_slug text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_plan record;
  v_sub_id uuid;
  v_period_end timestamptz;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No autorizado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Negocio no encontrado');
  END IF;

  SELECT id, slug, name, price, billing_interval INTO v_plan
  FROM plans
  WHERE slug = p_plan_slug AND active = true;

  IF v_plan IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Plan no encontrado: ' || coalesce(p_plan_slug, 'null'));
  END IF;

  v_period_end := CASE
    WHEN v_plan.billing_interval = 'monthly' THEN now() + interval '1 month'
    WHEN v_plan.billing_interval = 'annual' THEN now() + interval '1 year'
    ELSE now() + interval '1 month'
  END;

  UPDATE subscriptions SET
    plan_id = v_plan.id,
    status = 'active',
    plan_code_snapshot = v_plan.slug,
    price_snapshot = v_plan.price,
    billing_interval = v_plan.billing_interval,
    current_period_start = now(),
    current_period_end = v_period_end,
    trial_end = NULL,
    assigned_by = v_admin_id,
    notes = coalesce(p_notes, 'Asignado por admin'),
    updated_at = now()
  WHERE business_id = p_business_id
  RETURNING id INTO v_sub_id;

  IF v_sub_id IS NULL THEN
    INSERT INTO subscriptions (
      business_id, plan_id, status,
      current_period_start, current_period_end,
      plan_code_snapshot, price_snapshot, currency, billing_interval,
      created_by, assigned_by, notes
    ) VALUES (
      p_business_id, v_plan.id, 'active',
      now(), v_period_end,
      v_plan.slug, v_plan.price, 'MXN', v_plan.billing_interval,
      v_admin_id, v_admin_id, coalesce(p_notes, 'Asignado por admin')
    )
    RETURNING id INTO v_sub_id;
  END IF;

  PERFORM apply_plan_limits_to_business(p_business_id, v_plan.id);

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'admin_assign_plan', 'subscription', v_sub_id,
    jsonb_build_object('plan_slug', v_plan.slug, 'plan_name', v_plan.name, 'price', v_plan.price, 'period_end', v_period_end, 'notes', p_notes)
  );

  RETURN jsonb_build_object('success', true, 'code', 'PLAN_ASSIGNED', 'message', 'Plan ' || v_plan.name || ' asignado correctamente', 'plan_slug', v_plan.slug, 'period_end', v_period_end);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_assign_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_assign_plan TO authenticated;

CREATE OR REPLACE FUNCTION admin_unassign_plan(
  p_business_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_sub record;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No autorizado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Negocio no encontrado');
  END IF;

  SELECT id, status, plan_code_snapshot INTO v_sub
  FROM subscriptions
  WHERE business_id = p_business_id;

  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NO_SUB', 'message', 'El negocio no tiene suscripción');
  END IF;

  IF v_sub.status = 'canceled' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_CANCELED', 'message', 'El plan ya está cancelado');
  END IF;

  UPDATE subscriptions SET
    status = 'canceled',
    current_period_end = now(),
    assigned_by = v_admin_id,
    notes = coalesce(p_notes, 'Desasignado por admin'),
    updated_at = now()
  WHERE business_id = p_business_id;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'admin_unassign_plan', 'subscription', v_sub.id,
    jsonb_build_object('previous_plan', v_sub.plan_code_snapshot, 'previous_status', v_sub.status, 'notes', p_notes)
  );

  RETURN jsonb_build_object('success', true, 'code', 'PLAN_UNASSIGNED', 'message', 'Plan desasignado correctamente (anterior: ' || coalesce(v_sub.plan_code_snapshot, 'N/A') || ')');

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNKNOWN', 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_unassign_plan FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_unassign_plan TO authenticated;

CREATE OR REPLACE FUNCTION admin_extend_trial(
  p_business_id uuid,
  p_days integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_new_end timestamptz;
  v_admin_id uuid := auth.uid();
  v_action_msg text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
     RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  IF p_days < 1 OR p_days > 60 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Días debe ser entre 1 y 60');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio sin suscripción');
  END IF;

  IF v_sub.status NOT IN ('trialing', 'expired', 'canceled') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Solo se puede extender trial en status: trialing, expired o canceled');
  END IF;

  IF v_sub.status IN ('canceled', 'expired') THEN
     v_new_end := now() + (p_days || ' days')::interval;
     v_action_msg := 'Reactivado y extendido';

     UPDATE subscriptions
     SET trial_end = v_new_end,
         status = 'trialing',
         current_period_start = now(),
         current_period_end = v_new_end,
         notes = COALESCE(p_notes, notes),
         updated_at = now()
     WHERE business_id = p_business_id;

  ELSE
     v_new_end := GREATEST(COALESCE(v_sub.trial_end, now()), now()) + (p_days || ' days')::interval;
     v_action_msg := 'Extendido';

     UPDATE subscriptions
     SET trial_end = v_new_end,
         status = 'trialing',
         current_period_end = v_new_end,
         notes = COALESCE(p_notes, notes),
         updated_at = now()
     WHERE business_id = p_business_id;
  END IF;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'extend_trial', 'subscription', v_sub.id,
    jsonb_build_object('days_added', p_days, 'new_trial_end', v_new_end, 'old_status', v_sub.status, 'notes', p_notes)
  );

  RETURN jsonb_build_object('success', true, 'message', format('%s %s días (hasta %s)', v_action_msg, p_days, to_char(v_new_end, 'DD Mon YYYY HH24:MI')));
END;
$$;

REVOKE ALL ON FUNCTION admin_extend_trial FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_extend_trial TO authenticated;

CREATE OR REPLACE FUNCTION admin_suspend_business(
  p_business_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_admin_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo de suspensión requerido');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio sin suscripción');
  END IF;

  IF v_sub.status = 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio ya está suspendido');
  END IF;

  UPDATE subscriptions
  SET status = 'suspended', notes = p_notes, updated_at = now()
  WHERE business_id = p_business_id;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (p_business_id, v_admin_id, 'suspend_business', 'subscription', v_sub.id, jsonb_build_object('previous_status', v_sub.status, 'notes', p_notes));

  RETURN jsonb_build_object('success', true, 'message', format('Negocio suspendido. Estado anterior: %s', v_sub.status));
END;
$$;

REVOKE ALL ON FUNCTION admin_suspend_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_suspend_business TO authenticated;

CREATE OR REPLACE FUNCTION admin_unsuspend_business(
  p_business_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_admin_id uuid := auth.uid();
  v_new_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio sin suscripción');
  END IF;

  IF v_sub.status != 'suspended' THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio no está suspendido');
  END IF;

  IF v_sub.trial_end IS NOT NULL AND v_sub.trial_end > now() THEN
    v_new_status := 'trialing';
  ELSIF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now() THEN
    v_new_status := 'active';
  ELSE
    v_new_status := 'expired';
  END IF;

  UPDATE subscriptions
  SET status = v_new_status, notes = COALESCE(p_notes, notes), updated_at = now()
  WHERE business_id = p_business_id;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (p_business_id, v_admin_id, 'unsuspend_business', 'subscription', v_sub.id, jsonb_build_object('restored_status', v_new_status, 'notes', p_notes));

  RETURN jsonb_build_object('success', true, 'message', format('Negocio reactivado con estado: %s', v_new_status));
END;
$$;

REVOKE ALL ON FUNCTION admin_unsuspend_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_unsuspend_business TO authenticated;

CREATE OR REPLACE FUNCTION admin_schedule_plan_change(
  p_business_id uuid,
  p_plan_slug text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_plan record;
  v_admin_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  SELECT * INTO v_plan FROM plans WHERE slug = p_plan_slug AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Plan no encontrado');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio sin suscripción');
  END IF;

  IF v_sub.plan_code_snapshot = p_plan_slug THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio ya tiene ese plan');
  END IF;

  UPDATE subscriptions
  SET scheduled_plan_slug = p_plan_slug, scheduled_plan_at = now(), notes = COALESCE(p_notes, notes), updated_at = now()
  WHERE business_id = p_business_id;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'schedule_plan_change', 'subscription', v_sub.id,
    jsonb_build_object('current_plan', v_sub.plan_code_snapshot, 'scheduled_plan', p_plan_slug, 'effective_after', v_sub.current_period_end, 'notes', p_notes)
  );

  RETURN jsonb_build_object('success', true, 'message', format('Cambio a %s programado para fin de periodo (%s)', v_plan.name, COALESCE(to_char(v_sub.current_period_end, 'DD Mon YYYY'), 'sin fecha')));
END;
$$;

REVOKE ALL ON FUNCTION admin_schedule_plan_change FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_schedule_plan_change TO authenticated;

CREATE OR REPLACE FUNCTION admin_cancel_scheduled_change(
  p_business_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub record;
  v_admin_id uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
      RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF NOT FOUND OR v_sub.scheduled_plan_slug IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'No hay cambio programado');
  END IF;

  UPDATE subscriptions
  SET scheduled_plan_slug = NULL, scheduled_plan_at = NULL, updated_at = now()
  WHERE business_id = p_business_id;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (p_business_id, v_admin_id, 'cancel_scheduled_change', 'subscription', v_sub.id, jsonb_build_object('canceled_plan', v_sub.scheduled_plan_slug));

  RETURN jsonb_build_object('success', true, 'message', format('Cambio programado a %s cancelado', v_sub.scheduled_plan_slug));
END;
$$;

REVOKE ALL ON FUNCTION admin_cancel_scheduled_change FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_cancel_scheduled_change TO authenticated;

-- Soft-delete / restore de negocios, con bloqueo de usuarios afectados
CREATE OR REPLACE FUNCTION admin_delete_business(
  p_business_id uuid,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_biz record;
  v_members_affected integer;
  v_sub_id uuid;
  v_old_sub_status text;
  v_blocked_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  IF p_notes IS NULL OR trim(p_notes) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo de eliminación requerido');
  END IF;

  SELECT id, name, deleted_at INTO v_biz FROM businesses WHERE id = p_business_id FOR UPDATE;

  IF v_biz IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio no encontrado');
  END IF;

  IF v_biz.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio ya está eliminado');
  END IF;

  UPDATE businesses SET deleted_at = now() WHERE id = p_business_id;

  UPDATE business_memberships
  SET status = 'disabled', disabled_reason = 'business_deleted'
  WHERE business_id = p_business_id AND status = 'active';

  GET DIAGNOSTICS v_members_affected = ROW_COUNT;

  SELECT id, status INTO v_sub_id, v_old_sub_status FROM subscriptions WHERE business_id = p_business_id;

  IF v_sub_id IS NOT NULL THEN
    UPDATE subscriptions
    SET status = 'canceled', notes = 'Negocio eliminado por admin: ' || trim(p_notes), updated_at = now()
    WHERE id = v_sub_id;
  END IF;

  INSERT INTO blocked_users (user_id, reason, blocked_by, business_id, notes)
  SELECT bm.user_id, 'business_deleted', v_admin_id, p_business_id, trim(p_notes)
  FROM business_memberships bm
  WHERE bm.business_id = p_business_id
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_blocked_count = ROW_COUNT;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'delete_business', 'business', p_business_id,
    jsonb_build_object('business_name', v_biz.name, 'members_disabled', v_members_affected, 'users_blocked', v_blocked_count, 'previous_sub_status', v_old_sub_status, 'notes', trim(p_notes))
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Negocio "%s" eliminado. %s usuarios bloqueados.', v_biz.name, v_blocked_count),
    'members_affected', v_members_affected,
    'users_blocked', v_blocked_count
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_business TO authenticated;

CREATE OR REPLACE FUNCTION admin_restore_business(
  p_business_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_biz record;
  v_members_restored integer;
  v_unblocked_count integer;
  v_sub record;
  v_new_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'No autorizado');
  END IF;

  SELECT id, name, deleted_at INTO v_biz FROM businesses WHERE id = p_business_id FOR UPDATE;

  IF v_biz IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Negocio no encontrado');
  END IF;

  IF v_biz.deleted_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'El negocio no está eliminado');
  END IF;

  UPDATE businesses SET deleted_at = NULL WHERE id = p_business_id;

  UPDATE business_memberships
  SET status = 'active', disabled_reason = NULL
  WHERE business_id = p_business_id AND status = 'disabled' AND disabled_reason = 'business_deleted';

  GET DIAGNOSTICS v_members_restored = ROW_COUNT;

  DELETE FROM blocked_users WHERE business_id = p_business_id AND reason = 'business_deleted';

  GET DIAGNOSTICS v_unblocked_count = ROW_COUNT;

  SELECT * INTO v_sub FROM subscriptions WHERE business_id = p_business_id;

  IF v_sub IS NOT NULL THEN
    IF v_sub.trial_end IS NOT NULL AND v_sub.trial_end > now() THEN
      v_new_status := 'trialing';
    ELSIF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now() THEN
      v_new_status := 'active';
    ELSE
      v_new_status := 'expired';
    END IF;

    UPDATE subscriptions
    SET status = v_new_status, notes = COALESCE(p_notes, notes), updated_at = now()
    WHERE business_id = p_business_id;
  END IF;

  INSERT INTO audit_logs (business_id, actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    p_business_id, v_admin_id, 'restore_business', 'business', p_business_id,
    jsonb_build_object('business_name', v_biz.name, 'members_restored', v_members_restored, 'users_unblocked', v_unblocked_count, 'restored_sub_status', v_new_status, 'notes', p_notes)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Negocio "%s" restaurado. %s usuarios desbloqueados. Suscripción: %s', v_biz.name, v_unblocked_count, COALESCE(v_new_status, 'sin suscripción')),
    'members_restored', v_members_restored,
    'users_unblocked', v_unblocked_count,
    'sub_status', v_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_restore_business FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_restore_business TO authenticated;

CREATE OR REPLACE FUNCTION admin_get_business_detail(p_business_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_biz record;
  v_sub record;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No autorizado');
  END IF;

  SELECT id, name, type, operation_mode, created_at,
         limits_products, limits_orders_day, limits_users, limits_storage_mb,
         default_keep_float_amount, cash_difference_threshold
  INTO v_biz FROM businesses WHERE id = p_business_id;

  IF v_biz IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'Negocio no encontrado');
  END IF;

  SELECT s.id, s.status, s.plan_code_snapshot, s.price_snapshot,
         s.billing_interval, s.trial_end, s.current_period_start,
         s.current_period_end, s.notes, s.created_at, s.updated_at,
         s.assigned_by IS NOT NULL as admin_assigned,
         p.name as plan_name
  INTO v_sub FROM subscriptions s
  LEFT JOIN plans p ON p.slug = s.plan_code_snapshot
  WHERE s.business_id = p_business_id;

  RETURN jsonb_build_object(
    'success', true,
    'business', jsonb_build_object(
      'id', v_biz.id, 'name', v_biz.name, 'type', v_biz.type, 'operation_mode', v_biz.operation_mode,
      'created_at', v_biz.created_at, 'limits_products', v_biz.limits_products,
      'limits_orders_day', v_biz.limits_orders_day, 'limits_users', v_biz.limits_users,
      'limits_storage_mb', v_biz.limits_storage_mb,
      'default_keep_float_amount', v_biz.default_keep_float_amount,
      'cash_difference_threshold', v_biz.cash_difference_threshold
    ),
    'subscription', CASE WHEN v_sub IS NOT NULL THEN jsonb_build_object(
      'id', v_sub.id, 'status', v_sub.status, 'plan_code', v_sub.plan_code_snapshot, 'plan_name', v_sub.plan_name,
      'price', v_sub.price_snapshot, 'billing_interval', v_sub.billing_interval, 'trial_end', v_sub.trial_end,
      'period_start', v_sub.current_period_start, 'period_end', v_sub.current_period_end, 'notes', v_sub.notes,
      'admin_assigned', v_sub.admin_assigned, 'created_at', v_sub.created_at, 'updated_at', v_sub.updated_at
    ) ELSE NULL END,
    'owner', (
      SELECT jsonb_build_object('email', au.email, 'user_id', au.id)
      FROM auth.users au
      JOIN business_memberships bm ON bm.user_id = au.id
      WHERE bm.business_id = p_business_id AND bm.role = 'OWNER'
      LIMIT 1
    ),
    'members_count', (SELECT count(*) FROM business_memberships WHERE business_id = p_business_id),
    'audit_logs', (
      SELECT coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
      FROM (
        SELECT al.action, al.entity, al.entity_id, al.metadata, al.created_at, au.email as actor_email
        FROM audit_logs al
        LEFT JOIN auth.users au ON au.id = al.actor_user_id
        WHERE al.business_id = p_business_id
        ORDER BY al.created_at DESC
        LIMIT 20
      ) a
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_get_business_detail FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_get_business_detail TO authenticated;

-- Listado para el panel admin: incluye métricas de uso y heartbeat ("En línea")
CREATE OR REPLACE FUNCTION admin_list_businesses(p_include_deleted boolean DEFAULT false)
RETURNS jsonb AS $$
DECLARE
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Mexico_City');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN', 'message', 'No autorizado');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'businesses', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT
          b.id, b.name, b.type, b.created_at, b.deleted_at,
          b.limits_products, b.limits_orders_day, b.limits_users,
          (SELECT au.email FROM auth.users au
           JOIN business_memberships bm ON bm.user_id = au.id
           WHERE bm.business_id = b.id AND bm.role = 'OWNER'
           LIMIT 1) as owner_email,
          s.status as sub_status,
          s.plan_code_snapshot as plan_code,
          s.price_snapshot as plan_price,
          s.billing_interval,
          s.trial_end,
          s.current_period_end,
          s.assigned_by IS NOT NULL as admin_assigned,
          (SELECT count(*) FROM products WHERE business_id = b.id AND deleted_at IS NULL AND active = true) as usage_products,
          (SELECT count(*) FROM orders WHERE business_id = b.id AND created_at >= v_today AND status != 'CANCELLED') as usage_orders_day,
          (SELECT count(*) FROM business_memberships WHERE business_id = b.id AND status = 'active') as usage_users,
          GREATEST(
            b.created_at,
            (SELECT max(created_at) FROM orders WHERE business_id = b.id),
            (SELECT max(last_active_at) FROM business_memberships WHERE business_id = b.id)
          ) as last_activity
        FROM businesses b
        LEFT JOIN subscriptions s ON s.business_id = b.id
        WHERE (p_include_deleted OR b.deleted_at IS NULL)
        ORDER BY b.created_at DESC
      ) t
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION admin_list_businesses FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_businesses TO authenticated;

-- Heartbeat: llamado cada 60s desde el frontend para marcar actividad
CREATE OR REPLACE FUNCTION heartbeat()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE business_memberships
  SET last_active_at = now()
  WHERE user_id = auth.uid()
    AND status = 'active';
$$;

REVOKE ALL ON FUNCTION heartbeat FROM PUBLIC;
GRANT EXECUTE ON FUNCTION heartbeat TO authenticated;

-- =============================================
-- TRIGGERS
-- =============================================

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS orders_require_payment_for_close ON orders;
CREATE TRIGGER orders_require_payment_for_close
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION check_order_close_requires_payment();

DROP TRIGGER IF EXISTS payments_require_open_register ON payments;
CREATE TRIGGER payments_require_open_register
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_cash_register_open();

DROP TRIGGER IF EXISTS payments_refund_void_check ON payments;
CREATE TRIGGER payments_refund_void_check
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION check_refund_void_requires_paid();

DROP TRIGGER IF EXISTS trg_auto_inventory_on_payment ON payments;
CREATE TRIGGER trg_auto_inventory_on_payment
  AFTER INSERT ON payments
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION auto_deduct_inventory_on_payment();

DROP TRIGGER IF EXISTS trg_reverse_inventory_on_refund_void ON payments;
CREATE TRIGGER trg_reverse_inventory_on_refund_void
  AFTER UPDATE ON payments
  FOR EACH ROW
  WHEN (OLD.status = 'paid' AND NEW.status IN ('refunded', 'void'))
  EXECUTE FUNCTION reverse_inventory_on_refund_void();

DROP TRIGGER IF EXISTS trg_enforce_product_limit ON products;
CREATE TRIGGER trg_enforce_product_limit
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION enforce_product_limit();

DROP TRIGGER IF EXISTS trg_enforce_daily_payment_limit ON payments;
CREATE TRIGGER trg_enforce_daily_payment_limit
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_daily_payment_limit();

DROP TRIGGER IF EXISTS trg_enforce_user_limit ON business_memberships;
CREATE TRIGGER trg_enforce_user_limit
  BEFORE INSERT ON business_memberships
  FOR EACH ROW
  EXECUTE FUNCTION enforce_user_limit();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- businesses: ver/editar solo negocios activos donde soy miembro; INSERT
-- solo vía RPC create_business_and_owner_membership (SECURITY DEFINER).
DROP POLICY IF EXISTS "tenant_isolation" ON businesses;
CREATE POLICY "tenant_isolation" ON businesses
  FOR ALL USING (id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "businesses_insert_denied" ON businesses;
CREATE POLICY "businesses_insert_denied" ON businesses
  FOR INSERT WITH CHECK (false);

-- business_memberships: policies finales (reemplazan tenant_isolation)
DROP POLICY IF EXISTS "tenant_isolation" ON business_memberships;
DROP POLICY IF EXISTS "memberships_select" ON business_memberships;
CREATE POLICY "memberships_select" ON business_memberships
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "memberships_insert" ON business_memberships;
CREATE POLICY "memberships_insert" ON business_memberships
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR business_id IN (
      SELECT business_id FROM business_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

DROP POLICY IF EXISTS "memberships_update" ON business_memberships;
CREATE POLICY "memberships_update" ON business_memberships
  FOR UPDATE USING (
    business_id IN (
      SELECT business_id FROM business_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

DROP POLICY IF EXISTS "memberships_delete" ON business_memberships;
CREATE POLICY "memberships_delete" ON business_memberships
  FOR DELETE USING (
    business_id IN (
      SELECT business_id FROM business_memberships
      WHERE user_id = auth.uid() AND role = 'OWNER'
    )
  );

DROP POLICY IF EXISTS "tenant_isolation" ON categories;
CREATE POLICY "tenant_isolation" ON categories
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON products;
CREATE POLICY "tenant_isolation" ON products
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON product_recipes;
CREATE POLICY "tenant_isolation" ON product_recipes
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()))
  WITH CHECK (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON inventory_items;
CREATE POLICY "tenant_isolation" ON inventory_items
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON cash_registers;
CREATE POLICY "tenant_isolation" ON cash_registers
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON orders;
CREATE POLICY "tenant_isolation" ON orders
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON order_items;
CREATE POLICY "tenant_isolation" ON order_items
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON payments;
CREATE POLICY "tenant_isolation" ON payments
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON cash_movements;
CREATE POLICY "tenant_isolation" ON cash_movements
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON inventory_movements;
CREATE POLICY "tenant_isolation" ON inventory_movements
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

DROP POLICY IF EXISTS "tenant_isolation" ON expenses;
CREATE POLICY "tenant_isolation" ON expenses
  FOR ALL USING (business_id IN (SELECT active_business_ids_for_user()));

-- audit_logs: solo OWNER/ADMIN pueden leer; nadie escribe directo
-- (solo vía RPCs SECURITY DEFINER). Nunca se abre con tenant_isolation FOR ALL.
DROP POLICY IF EXISTS "tenant_isolation" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_read_owner_admin" ON audit_logs;
CREATE POLICY "audit_logs_read_owner_admin" ON audit_logs
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_memberships
      WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN') AND status = 'active'
    )
  );
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM anon, authenticated;

-- profiles: cada usuario ve/edita solo su perfil
DROP POLICY IF EXISTS "users_own_profile" ON profiles;
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- admin_users: solo admins pueden leerse entre sí; nadie modifica desde cliente
DROP POLICY IF EXISTS "admin_users_select" ON admin_users;
CREATE POLICY "admin_users_select" ON admin_users
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM admin_users));

DROP POLICY IF EXISTS "admin_users_insert_denied" ON admin_users;
CREATE POLICY "admin_users_insert_denied" ON admin_users FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "admin_users_update_denied" ON admin_users;
CREATE POLICY "admin_users_update_denied" ON admin_users FOR UPDATE USING (false);
DROP POLICY IF EXISTS "admin_users_delete_denied" ON admin_users;
CREATE POLICY "admin_users_delete_denied" ON admin_users FOR DELETE USING (false);

-- blocked_users: nadie lee/escribe desde cliente, solo RPCs SECURITY DEFINER
REVOKE ALL ON blocked_users FROM authenticated, anon;

-- plans: catálogo público de solo lectura para autenticados
DROP POLICY IF EXISTS "plans_select_authenticated" ON plans;
CREATE POLICY "plans_select_authenticated" ON plans
  FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "plans_insert_denied" ON plans;
CREATE POLICY "plans_insert_denied" ON plans FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "plans_update_denied" ON plans;
CREATE POLICY "plans_update_denied" ON plans FOR UPDATE USING (false);
DROP POLICY IF EXISTS "plans_delete_denied" ON plans;
CREATE POLICY "plans_delete_denied" ON plans FOR DELETE USING (false);

-- subscriptions: solo lectura de la propia (todo cambio es vía RPC/admin)
DROP POLICY IF EXISTS "subscriptions_select" ON subscriptions;
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS "subscriptions_insert_denied" ON subscriptions;
CREATE POLICY "subscriptions_insert_denied" ON subscriptions FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "subscriptions_update_denied" ON subscriptions;
CREATE POLICY "subscriptions_update_denied" ON subscriptions FOR UPDATE USING (false);
DROP POLICY IF EXISTS "subscriptions_delete_denied" ON subscriptions;
CREATE POLICY "subscriptions_delete_denied" ON subscriptions FOR DELETE USING (false);

-- =============================================
-- FIN
-- =============================================
