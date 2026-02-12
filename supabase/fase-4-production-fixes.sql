-- ============================================
-- FASE 4.2 — Hardening: RLS + Triggers
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- ============================================
-- 1) AUDIT LOGS — Solo OWNER/ADMIN pueden leer
-- ============================================

-- Quitar la policy de tenant_isolation genérica
DROP POLICY IF EXISTS "tenant_isolation" ON audit_logs;

-- Solo OWNER y ADMIN pueden leer audit logs
CREATE POLICY "audit_logs_read_owner_admin" ON audit_logs
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_memberships
      WHERE user_id = auth.uid() AND role IN ('OWNER', 'ADMIN')
    )
  );

-- Bloquear INSERT/UPDATE/DELETE directo (solo RPCs SECURITY DEFINER pueden escribir)
REVOKE INSERT, UPDATE, DELETE ON audit_logs FROM anon, authenticated;

-- ============================================
-- 2) TRIGGER: Enforce product limit
-- ============================================

CREATE OR REPLACE FUNCTION enforce_product_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_limit INT;
BEGIN
  -- Advisory lock para evitar race conditions con inserts concurrentes
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

DROP TRIGGER IF EXISTS trg_enforce_product_limit ON products;
CREATE TRIGGER trg_enforce_product_limit
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION enforce_product_limit();

-- ============================================
-- 3) TRIGGER: Enforce daily payment limit
-- ============================================

CREATE OR REPLACE FUNCTION enforce_daily_payment_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_limit INT;
BEGIN
  -- Solo contar si el payment llega como 'paid'
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;

  -- Endurecer: si paid_at viene NULL, forzar now()
  IF NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;

  -- Advisory lock para evitar race conditions con inserts concurrentes
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

DROP TRIGGER IF EXISTS trg_enforce_daily_payment_limit ON payments;
CREATE TRIGGER trg_enforce_daily_payment_limit
  BEFORE INSERT ON payments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_daily_payment_limit();

-- ============================================
-- 4) TRIGGER: Enforce user limit
-- ============================================

CREATE OR REPLACE FUNCTION enforce_user_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_limit INT;
BEGIN
  -- Advisory lock para evitar race conditions con inserts concurrentes
  PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text || '_users'));

  -- Solo contar miembros activos (no desactivados)
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

DROP TRIGGER IF EXISTS trg_enforce_user_limit ON business_memberships;
CREATE TRIGGER trg_enforce_user_limit
  BEFORE INSERT ON business_memberships
  FOR EACH ROW
  EXECUTE FUNCTION enforce_user_limit();

-- ============================================
-- 5) Ensure limit columns exist on businesses
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'limits_products'
  ) THEN
    ALTER TABLE businesses ADD COLUMN limits_products INT DEFAULT 100;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'limits_orders_day'
  ) THEN
    ALTER TABLE businesses ADD COLUMN limits_orders_day INT DEFAULT 200;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name = 'limits_users'
  ) THEN
    ALTER TABLE businesses ADD COLUMN limits_users INT DEFAULT 3;
  END IF;
END$$;

-- ============================================
-- 6) Índice parcial para conteo diario de pagos
-- ============================================

CREATE INDEX IF NOT EXISTS idx_payments_limit_day
  ON payments (business_id, paid_at)
  WHERE status = 'paid' AND deleted_at IS NULL;
