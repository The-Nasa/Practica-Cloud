CREATE TABLE catalog.product_favorites (
 user_id uuid NOT NULL REFERENCES identity.users(id),
 product_id uuid NOT NULL REFERENCES catalog.products(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,product_id)
);
ALTER TABLE platform.notifications ADD COLUMN source_event_id uuid REFERENCES platform.outbox_events(id);
CREATE UNIQUE INDEX notifications_event_user_unique ON platform.notifications(source_event_id,user_id) WHERE source_event_id IS NOT NULL;
ALTER TABLE support.tickets ADD COLUMN version integer NOT NULL DEFAULT 0 CHECK(version>=0);
ALTER TABLE delivery.incidents ADD COLUMN ticket_id uuid UNIQUE REFERENCES support.tickets(id);
