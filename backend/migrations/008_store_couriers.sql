CREATE TABLE IF NOT EXISTS merchant.store_couriers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES merchant.stores(id) ON DELETE CASCADE,
    courier_user_id uuid NOT NULL REFERENCES delivery.courier_profiles(user_id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'inactive')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (store_id, courier_user_id)
);

CREATE INDEX IF NOT EXISTS store_couriers_store_idx ON merchant.store_couriers(store_id);
CREATE INDEX IF NOT EXISTS store_couriers_courier_idx ON merchant.store_couriers(courier_user_id);
