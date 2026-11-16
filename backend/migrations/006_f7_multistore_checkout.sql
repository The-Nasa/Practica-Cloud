-- One atomic checkout groups independent single-store purchases, deliveries and cash collections.
-- Existing purchases and financial constraints remain unchanged.
CREATE TABLE ordering.checkout_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkout_groups_customer_idx ON ordering.checkout_groups(customer_id,created_at,id);
CREATE TRIGGER checkout_groups_immutable BEFORE UPDATE OR DELETE ON ordering.checkout_groups
  FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
ALTER TABLE ordering.purchases ADD COLUMN checkout_group_id uuid REFERENCES ordering.checkout_groups(id);
CREATE INDEX purchases_checkout_group_idx ON ordering.purchases(checkout_group_id) WHERE checkout_group_id IS NOT NULL;
