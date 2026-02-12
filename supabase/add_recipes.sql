-- =============================================
-- GastroOS - Recetas (Producto → Ingredientes)
-- =============================================

-- Tabla de recetas: vincula productos con items de inventario
CREATE TABLE IF NOT EXISTS product_recipes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity numeric(10,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz DEFAULT now(),
  
  -- Un ingrediente solo puede estar una vez por producto
  UNIQUE(product_id, inventory_item_id)
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_product_recipes_product ON product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_business ON product_recipes(business_id);

-- RLS
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON product_recipes
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );

-- Permitir crear recetas a usuarios autenticados del negocio
CREATE POLICY "users_can_manage_recipes" ON product_recipes
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  )
  WITH CHECK (
    business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid())
  );
