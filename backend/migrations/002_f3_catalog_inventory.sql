-- Additive catalog management and append-only physical inventory ledger.
-- Product taxonomy is independent from merchant categories; these are catalog data, not demo products.
INSERT INTO catalog.categories(code,name) VALUES
  ('prepared_food','Comida preparada'),('beverages','Bebidas'),('groceries','Despensa'),
  ('health','Salud'),('personal_care','Cuidado personal'),('home','Hogar'),
  ('technology','Tecnología'),('clothing','Ropa y accesorios'),('other','Otros')
  ON CONFLICT DO NOTHING;
ALTER TABLE catalog.products ADD COLUMN position integer NOT NULL DEFAULT 0 CHECK (position >= 0);
ALTER TABLE inventory.stock ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0);
CREATE INDEX products_position_idx ON catalog.products(position,id);
CREATE TABLE inventory.movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id uuid NOT NULL REFERENCES catalog.skus(id),
  actor_user_id uuid REFERENCES identity.users(id),
  kind text NOT NULL CHECK (kind IN ('initial','adjustment','consumption')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  on_hand_after integer NOT NULL CHECK (on_hand_after >= 0),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  order_item_id uuid REFERENCES ordering.order_items(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_item_id)
);
CREATE INDEX movements_sku_date_idx ON inventory.movements(sku_id, created_at DESC, id DESC);
CREATE FUNCTION inventory.guard_movement_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory movements are append-only' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER movements_immutable BEFORE UPDATE OR DELETE ON inventory.movements
  FOR EACH ROW EXECUTE FUNCTION inventory.guard_movement_history();
