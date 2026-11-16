-- Historical orders retain manual handling. Only new orders receive an explicit deadline.
ALTER TABLE ordering.merchant_orders ADD COLUMN acceptance_expires_at timestamptz;
ALTER TABLE ordering.merchant_orders ADD CONSTRAINT acceptance_deadline_after_creation
  CHECK (acceptance_expires_at IS NULL OR acceptance_expires_at > created_at);
CREATE INDEX merchant_orders_acceptance_deadline_idx ON ordering.merchant_orders(acceptance_expires_at,id)
  WHERE status_code='pending' AND acceptance_expires_at IS NOT NULL;
