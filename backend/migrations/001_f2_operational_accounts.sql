-- Additive migration over 001_schema.sql. Executed transactionally by migrate.cjs.
ALTER TABLE merchant.stores
  ADD COLUMN legal_business_name text,
  ADD COLUMN tax_id text CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{11}$'),
  ADD COLUMN status_reason text,
  ADD CONSTRAINT stores_accepting_only_active CHECK (NOT accepting_orders OR status = 'active');

ALTER TABLE merchant.memberships
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN revoked_at timestamptz,
  ADD CONSTRAINT memberships_revocation_check CHECK (is_active = (revoked_at IS NULL));
CREATE UNIQUE INDEX memberships_active_owner_uk ON merchant.memberships(store_id)
  WHERE membership_role = 'owner' AND is_active;

ALTER TABLE delivery.courier_profiles
  ADD COLUMN status_reason text,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT couriers_online_only_active CHECK (NOT is_online OR status = 'active');

CREATE INDEX courier_status_idx ON delivery.courier_profiles(status, user_id);
CREATE INDEX stores_status_idx ON merchant.stores(status, id);
