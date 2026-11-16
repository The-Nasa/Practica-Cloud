-- QUICKLY: esquema inicial PostgreSQL 17+; modelo relacional en 3FN.
-- Ejecutar en una base VACIA con psql -X -v ON_ERROR_STOP=1 -f 001_schema.sql.
-- No crea usuarios ni bases, no elimina objetos y no es una migracion repetible.
-- Todas las cantidades monetarias son centimos PEN. Ver arquitectura-backend.md.
BEGIN;

CREATE SCHEMA identity;
CREATE SCHEMA geography;
CREATE SCHEMA merchant;
CREATE SCHEMA catalog;
CREATE SCHEMA ordering;
CREATE SCHEMA inventory;
CREATE SCHEMA billing;
CREATE SCHEMA delivery;
CREATE SCHEMA support;
CREATE SCHEMA platform;

-- IDENTIDAD: un usuario puede tener varios roles sin duplicar su perfil.
CREATE TABLE identity.users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text NOT NULL CHECK (btrim(full_name) <> ''),
    email text NOT NULL CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
    phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
    avatar_object_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_uk UNIQUE (email),
    CONSTRAINT users_phone_uk UNIQUE (phone)
);
CREATE TABLE identity.roles (
    code text PRIMARY KEY,
    label text NOT NULL UNIQUE
);
INSERT INTO identity.roles VALUES
    ('customer', 'Cliente'), ('merchant', 'Comercio'),
    ('courier', 'Repartidor'), ('admin', 'Administrador');
CREATE TABLE identity.user_roles (
    user_id uuid NOT NULL REFERENCES identity.users(id),
    role_code text NOT NULL REFERENCES identity.roles(code),
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_code)
);
CREATE INDEX user_roles_role_idx ON identity.user_roles(role_code);
CREATE TABLE identity.password_credentials (
    user_id uuid PRIMARY KEY REFERENCES identity.users(id),
    password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
    changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity.external_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id),
    provider text NOT NULL,
    provider_subject text NOT NULL,
    UNIQUE (provider, provider_subject),
    UNIQUE (user_id, provider)
);
CREATE TABLE identity.sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id),
    token_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CHECK (expires_at > created_at),
    CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX sessions_user_idx ON identity.sessions(user_id);
CREATE INDEX sessions_expiry_idx ON identity.sessions(expires_at) WHERE revoked_at IS NULL;
CREATE TABLE identity.password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id),
    token_hash text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    CHECK (expires_at > created_at),
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX password_reset_user_idx ON identity.password_reset_tokens(user_id);

-- GEOGRAFIA: cada fila es una zona operativa local, no una division politica.
CREATE TABLE geography.coverage_zones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL UNIQUE,
    description text NOT NULL DEFAULT '',
    base_fee_cents bigint NOT NULL CHECK (base_fee_cents BETWEEN 0 AND 100000000),
    estimated_minutes integer NOT NULL CHECK (estimated_minutes > 0),
    is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE geography.addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id),
    zone_id uuid NOT NULL REFERENCES geography.coverage_zones(id),
    label text NOT NULL,
    recipient_name text NOT NULL,
    phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    street text NOT NULL,
    street_number text NOT NULL,
    reference text NOT NULL DEFAULT '',
    latitude numeric(9,6),
    longitude numeric(9,6),
    is_default boolean NOT NULL DEFAULT false,
    archived_at timestamptz,
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK (latitude BETWEEN -90 AND 90),
    CHECK (longitude BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX addresses_default_uk ON geography.addresses(user_id)
    WHERE is_default AND archived_at IS NULL;
CREATE INDEX addresses_user_idx ON geography.addresses(user_id);
CREATE INDEX addresses_zone_idx ON geography.addresses(zone_id);

-- COMERCIOS: membresia por tienda, independiente del rol global del usuario.
CREATE TABLE merchant.categories (
    code text PRIMARY KEY,
    label text NOT NULL UNIQUE
);
INSERT INTO merchant.categories VALUES
    ('restaurantes', 'Restaurantes'), ('farmacias', 'Farmacias'), ('bodegas', 'Bodegas'),
    ('ropa', 'Ropa'), ('emprendedores', 'Emprendedores'), ('supermercados', 'Supermercados'),
    ('tecnologia', 'Tecnologia'), ('electrohogar', 'Electrohogar'), ('hogar', 'Hogar');
CREATE TABLE merchant.stores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_code text NOT NULL REFERENCES merchant.categories(code),
    zone_id uuid NOT NULL REFERENCES geography.coverage_zones(id),
    name text NOT NULL CHECK (btrim(name) <> ''),
    description text NOT NULL DEFAULT '',
    address_text text NOT NULL,
    phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
    accepting_orders boolean NOT NULL DEFAULT false,
    preparation_minutes integer NOT NULL DEFAULT 30 CHECK (preparation_minutes > 0),
    minimum_order_cents bigint NOT NULL DEFAULT 0 CHECK (minimum_order_cents BETWEEN 0 AND 100000000),
    logo_object_key text,
    banner_object_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stores_category_idx ON merchant.stores(category_code);
CREATE INDEX stores_zone_idx ON merchant.stores(zone_id);
CREATE INDEX stores_active_idx ON merchant.stores(id) WHERE status = 'active' AND accepting_orders;
CREATE TABLE merchant.memberships (
    store_id uuid NOT NULL REFERENCES merchant.stores(id),
    user_id uuid NOT NULL REFERENCES identity.users(id),
    membership_role text NOT NULL CHECK (membership_role IN ('owner', 'manager', 'operator')),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (store_id, user_id)
);
CREATE INDEX memberships_user_idx ON merchant.memberships(user_id);
CREATE TABLE merchant.opening_intervals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES merchant.stores(id),
    weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
    opens_at time NOT NULL,
    closes_at time NOT NULL,
    CHECK (opens_at < closes_at),
    UNIQUE (store_id, weekday, opens_at)
);
-- ISO: lunes=1, domingo=7. Turnos nocturnos se dividen en dos dias.

-- CATALOGO: cada producto tiene al menos un SKU vendible (regla de aplicacion).
-- Un producto sin variantes usa un SKU 'Estandar'; precio y stock pertenecen al SKU.
CREATE TABLE catalog.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    name text NOT NULL UNIQUE
);
CREATE TABLE catalog.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES merchant.stores(id),
    category_id uuid NOT NULL REFERENCES catalog.categories(id),
    name text NOT NULL CHECK (btrim(name) <> ''),
    description text NOT NULL DEFAULT '',
    brand text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_store_idx ON catalog.products(store_id, is_active);
CREATE INDEX products_category_idx ON catalog.products(category_id);
CREATE TABLE catalog.skus (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES catalog.products(id),
    sku_code text NOT NULL UNIQUE,
    variant_name text NOT NULL DEFAULT 'Estandar' CHECK (btrim(variant_name) <> ''),
    price_cents bigint NOT NULL CHECK (price_cents BETWEEN 1 AND 100000000),
    barcode text UNIQUE,
    is_active boolean NOT NULL DEFAULT true,
    UNIQUE (product_id, variant_name)
);
CREATE TABLE catalog.product_images (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES catalog.products(id),
    object_key text NOT NULL,
    alt_text text NOT NULL DEFAULT '',
    position smallint NOT NULL CHECK (position >= 0),
    UNIQUE (product_id, position),
    UNIQUE (product_id, object_key)
);
CREATE TABLE catalog.favorites (
    user_id uuid NOT NULL REFERENCES identity.users(id),
    store_id uuid NOT NULL REFERENCES merchant.stores(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, store_id)
);
CREATE INDEX favorites_store_idx ON catalog.favorites(store_id);

-- PEDIDOS: estados explicitos; ni totales derivados ni nombres actuales repetidos.
CREATE TABLE ordering.order_statuses (
    code text PRIMARY KEY,
    label text NOT NULL UNIQUE,
    is_terminal boolean NOT NULL
);
INSERT INTO ordering.order_statuses VALUES
    ('pending', 'Pendiente', false), ('confirmed', 'Confirmado', false),
    ('preparing', 'En preparacion', false), ('ready', 'Listo para recoger', false),
    ('in_transit', 'En camino', false), ('delivered', 'Entregado', true),
    ('cancelled', 'Cancelado', true), ('rejected', 'Rechazado', true);
CREATE TABLE ordering.allowed_transitions (
    from_status text NOT NULL REFERENCES ordering.order_statuses(code),
    to_status text NOT NULL REFERENCES ordering.order_statuses(code),
    PRIMARY KEY (from_status, to_status),
    CHECK (from_status <> to_status)
);
INSERT INTO ordering.allowed_transitions VALUES
    ('pending', 'confirmed'), ('pending', 'rejected'), ('pending', 'cancelled'),
    ('confirmed', 'preparing'), ('confirmed', 'cancelled'),
    ('preparing', 'ready'), ('ready', 'in_transit'), ('in_transit', 'delivered');
CREATE TABLE ordering.purchases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    customer_id uuid NOT NULL REFERENCES identity.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchases_customer_idx ON ordering.purchases(customer_id, created_at DESC, id);
-- Datos de entrega ACORDADOS para esta compra, no el perfil actual del cliente.
CREATE TABLE ordering.purchase_destinations (
    purchase_id uuid PRIMARY KEY REFERENCES ordering.purchases(id),
    zone_id uuid NOT NULL REFERENCES geography.coverage_zones(id),
    recipient_name text NOT NULL,
    phone text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    street text NOT NULL,
    street_number text NOT NULL,
    reference text NOT NULL DEFAULT '',
    latitude numeric(9,6),
    longitude numeric(9,6),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK (latitude BETWEEN -90 AND 90),
    CHECK (longitude BETWEEN -180 AND 180)
);
CREATE INDEX purchase_destinations_zone_idx ON ordering.purchase_destinations(zone_id);
CREATE TABLE ordering.merchant_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id uuid NOT NULL REFERENCES ordering.purchases(id),
    store_id uuid NOT NULL REFERENCES merchant.stores(id),
    status_code text NOT NULL DEFAULT 'pending' REFERENCES ordering.order_statuses(code),
    delivery_fee_cents bigint NOT NULL CHECK (delivery_fee_cents BETWEEN 0 AND 100000000),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (purchase_id, store_id)
);
CREATE INDEX merchant_orders_store_idx ON ordering.merchant_orders(store_id, status_code, created_at, id);
CREATE INDEX merchant_orders_status_idx ON ordering.merchant_orders(status_code, created_at);
CREATE TABLE ordering.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_order_id uuid NOT NULL REFERENCES ordering.merchant_orders(id),
    sku_id uuid NOT NULL REFERENCES catalog.skus(id),
    product_name_at_sale text NOT NULL CHECK (btrim(product_name_at_sale) <> ''),
    variant_name_at_sale text NOT NULL CHECK (btrim(variant_name_at_sale) <> ''),
    unit_price_cents bigint NOT NULL CHECK (unit_price_cents BETWEEN 1 AND 100000000),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
    note text NOT NULL DEFAULT ''
);
CREATE INDEX order_items_order_idx ON ordering.order_items(merchant_order_id);
CREATE INDEX order_items_sku_idx ON ordering.order_items(sku_id);
CREATE TABLE ordering.order_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    merchant_order_id uuid NOT NULL REFERENCES ordering.merchant_orders(id),
    order_version integer NOT NULL CHECK (order_version >= 0),
    status_code text NOT NULL REFERENCES ordering.order_statuses(code),
    actor_user_id uuid REFERENCES identity.users(id),
    reason text,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (merchant_order_id, order_version)
);
CREATE INDEX order_events_actor_idx ON ordering.order_events(actor_user_id);
CREATE TABLE ordering.reviews (
    merchant_order_id uuid PRIMARY KEY REFERENCES ordering.merchant_orders(id),
    rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment text,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Autor y comercio de una resena se obtienen mediante joins, no se duplican.

-- INVENTARIO: existencia fisica y reservas son hechos diferentes.
CREATE TABLE inventory.stock (
    sku_id uuid PRIMARY KEY REFERENCES catalog.skus(id),
    on_hand integer NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inventory.reservations (
    order_item_id uuid PRIMARY KEY REFERENCES ordering.order_items(id),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'released')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz,
    closed_at timestamptz,
    CHECK (expires_at IS NULL OR expires_at > created_at),
    CHECK ((status = 'active' AND closed_at IS NULL) OR (status <> 'active' AND closed_at IS NOT NULL))
);
CREATE INDEX reservations_active_idx ON inventory.reservations(order_item_id) WHERE status = 'active';
-- SKU y cantidad se deducen de order_item_id: repetirlos aqui introduciria dependencias transitivas.

-- COBROS: cada fila es un intento; reembolsos son hechos separados del pago.
CREATE TABLE billing.payment_methods (
    code text PRIMARY KEY,
    label text NOT NULL UNIQUE
);
INSERT INTO billing.payment_methods VALUES
    ('cash', 'Efectivo'), ('yape_plin', 'Yape / Plin'), ('card', 'Tarjeta');
CREATE TABLE billing.payment_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id uuid NOT NULL REFERENCES ordering.purchases(id),
    method_code text NOT NULL REFERENCES billing.payment_methods(code),
    provider text NOT NULL CHECK (btrim(provider) <> ''),
    provider_reference text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
    amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000000000),
    collected_by_user_id uuid REFERENCES identity.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    succeeded_at timestamptz,
    UNIQUE (provider, provider_reference),
    CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL))
);
CREATE INDEX payment_attempts_purchase_idx ON billing.payment_attempts(purchase_id, created_at DESC);
CREATE INDEX payment_attempts_method_idx ON billing.payment_attempts(method_code);
CREATE INDEX payment_attempts_collector_idx ON billing.payment_attempts(collected_by_user_id);
-- MVP: un cobro completo por compra. Reintentos fallidos no impiden un cobro posterior.
CREATE UNIQUE INDEX payment_attempts_success_uk ON billing.payment_attempts(purchase_id)
    WHERE status = 'succeeded';
CREATE TABLE billing.refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_attempt_id uuid NOT NULL REFERENCES billing.payment_attempts(id),
    merchant_order_id uuid NOT NULL REFERENCES ordering.merchant_orders(id),
    amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000000000000),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
    request_key text NOT NULL UNIQUE,
    provider_reference text,
    reason text NOT NULL CHECK (btrim(reason) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    succeeded_at timestamptz,
    CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL))
);
CREATE INDEX refunds_payment_idx ON billing.refunds(payment_attempt_id);
CREATE INDEX refunds_order_idx ON billing.refunds(merchant_order_id);
CREATE UNIQUE INDEX refunds_order_active_uk ON billing.refunds(merchant_order_id)
    WHERE status IN ('pending', 'processing', 'succeeded');
CREATE TABLE billing.webhook_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    UNIQUE (provider, provider_event_id)
);
-- Payload externo opaco; sus datos no sustituyen las tablas relacionales de negocio.

-- REPARTO: una asignacion es un intento; se preservan los intentos cancelados.
CREATE TABLE delivery.courier_profiles (
    user_id uuid PRIMARY KEY REFERENCES identity.users(id),
    vehicle_type text NOT NULL CHECK (vehicle_type IN ('motorcycle', 'bicycle', 'mototaxi')),
    plate text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'suspended')),
    is_online boolean NOT NULL DEFAULT false,
    current_zone_id uuid REFERENCES geography.coverage_zones(id),
    CHECK (vehicle_type = 'bicycle' OR nullif(btrim(plate), '') IS NOT NULL)
);
CREATE INDEX couriers_zone_idx ON delivery.courier_profiles(current_zone_id);
CREATE TABLE delivery.assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_order_id uuid NOT NULL REFERENCES ordering.merchant_orders(id),
    courier_user_id uuid NOT NULL REFERENCES delivery.courier_profiles(user_id),
    status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'picked_up', 'delivered', 'cancelled')),
    agreed_fee_cents bigint NOT NULL CHECK (agreed_fee_cents BETWEEN 0 AND 100000000),
    accepted_at timestamptz NOT NULL DEFAULT now(),
    picked_up_at timestamptz,
    delivered_at timestamptz,
    cancelled_at timestamptz,
    CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)),
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
    CHECK (status NOT IN ('picked_up', 'delivered') OR picked_up_at IS NOT NULL),
    CHECK (picked_up_at IS NULL OR picked_up_at >= accepted_at),
    CHECK (delivered_at IS NULL OR delivered_at >= picked_up_at),
    CHECK (cancelled_at IS NULL OR cancelled_at >= accepted_at)
);
CREATE UNIQUE INDEX assignments_live_order_uk ON delivery.assignments(merchant_order_id)
    WHERE status IN ('accepted', 'picked_up');
CREATE UNIQUE INDEX assignments_delivered_order_uk ON delivery.assignments(merchant_order_id)
    WHERE status = 'delivered';
CREATE UNIQUE INDEX assignments_live_courier_uk ON delivery.assignments(courier_user_id)
    WHERE status IN ('accepted', 'picked_up');
CREATE INDEX assignments_order_idx ON delivery.assignments(merchant_order_id);
CREATE INDEX assignments_courier_idx ON delivery.assignments(courier_user_id, accepted_at DESC);
CREATE TABLE delivery.incidents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id uuid NOT NULL REFERENCES delivery.assignments(id),
    reported_by_user_id uuid NOT NULL REFERENCES identity.users(id),
    description text NOT NULL CHECK (btrim(description) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);
CREATE INDEX incidents_assignment_idx ON delivery.incidents(assignment_id);
CREATE INDEX incidents_reporter_idx ON delivery.incidents(reported_by_user_id);

-- SOPORTE Y OPERACION.
CREATE TABLE support.tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_user_id uuid NOT NULL REFERENCES identity.users(id),
    merchant_order_id uuid REFERENCES ordering.merchant_orders(id),
    subject text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved')),
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    CHECK ((status = 'resolved') = (resolved_at IS NOT NULL))
);
CREATE INDEX tickets_requester_idx ON support.tickets(requester_user_id, created_at DESC);
CREATE INDEX tickets_order_idx ON support.tickets(merchant_order_id);
CREATE INDEX tickets_queue_idx ON support.tickets(status, priority, created_at);
CREATE TABLE support.ticket_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL REFERENCES support.tickets(id),
    author_user_id uuid NOT NULL REFERENCES identity.users(id),
    body text NOT NULL CHECK (btrim(body) <> ''),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_messages_ticket_idx ON support.ticket_messages(ticket_id, created_at, id);
CREATE INDEX ticket_messages_author_idx ON support.ticket_messages(author_user_id);
CREATE TABLE platform.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES identity.users(id),
    kind text NOT NULL CHECK (kind IN ('order', 'delivery', 'system', 'promotion')),
    title text NOT NULL,
    message text NOT NULL,
    relative_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at timestamptz
);
CREATE INDEX notifications_user_idx ON platform.notifications(user_id, created_at DESC, id);
CREATE INDEX notifications_unread_idx ON platform.notifications(user_id) WHERE read_at IS NULL;
CREATE TABLE platform.audit_entries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id uuid REFERENCES identity.users(id),
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    request_id uuid NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON platform.audit_entries(entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_actor_idx ON platform.audit_entries(actor_user_id, occurred_at DESC);
CREATE INDEX audit_request_idx ON platform.audit_entries(request_id);
CREATE TABLE platform.idempotency_keys (
    user_id uuid NOT NULL REFERENCES identity.users(id),
    operation text NOT NULL,
    key text NOT NULL CHECK (length(key) BETWEEN 1 AND 200),
    request_hash text NOT NULL,
    response_status smallint,
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, operation, key),
    CHECK (expires_at > created_at),
    CHECK ((response_status IS NULL) = (response_body IS NULL)),
    CHECK (response_status BETWEEN 100 AND 599)
);
CREATE INDEX idempotency_expiry_idx ON platform.idempotency_keys(expires_at);
CREATE TABLE platform.outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    available_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    published_at timestamptz
);
CREATE INDEX outbox_pending_idx ON platform.outbox_events(available_at, created_at)
    WHERE published_at IS NULL;

-- VISTAS: derivaciones que no se almacenan como columnas redundantes.
CREATE VIEW ordering.order_totals AS
SELECT o.id AS merchant_order_id,
       COALESCE(sum(i.unit_price_cents::numeric * i.quantity), 0)::bigint AS subtotal_cents,
       o.delivery_fee_cents,
       (COALESCE(sum(i.unit_price_cents::numeric * i.quantity), 0) + o.delivery_fee_cents)::bigint AS total_cents
FROM ordering.merchant_orders o
LEFT JOIN ordering.order_items i ON i.merchant_order_id = o.id
GROUP BY o.id;
CREATE VIEW ordering.purchase_totals AS
SELECT p.id AS purchase_id,
       COALESCE(sum(t.subtotal_cents), 0)::bigint AS subtotal_cents,
       COALESCE(sum(t.delivery_fee_cents), 0)::bigint AS delivery_fee_cents,
       COALESCE(sum(t.total_cents), 0)::bigint AS total_cents
FROM ordering.purchases p
LEFT JOIN ordering.merchant_orders o ON o.purchase_id = p.id
LEFT JOIN ordering.order_totals t ON t.merchant_order_id = o.id
GROUP BY p.id;
CREATE VIEW ordering.purchase_states AS
SELECT p.id AS purchase_id,
       CASE
           WHEN count(o.id) = 0 THEN 'pending'
           WHEN bool_and(o.status_code = 'delivered') THEN 'completed'
           WHEN bool_and(o.status_code IN ('cancelled', 'rejected')) THEN 'cancelled'
           WHEN bool_or(o.status_code = 'delivered')
                AND bool_and(o.status_code IN ('delivered', 'cancelled', 'rejected'))
               THEN 'completed_with_cancellations'
           WHEN bool_or(o.status_code = 'delivered') THEN 'partially_delivered'
           WHEN bool_and(o.status_code = 'pending') THEN 'pending'
           ELSE 'in_progress'
       END AS status
FROM ordering.purchases p
LEFT JOIN ordering.merchant_orders o ON o.purchase_id = p.id
GROUP BY p.id;
CREATE VIEW inventory.availability AS
SELECT s.sku_id, s.on_hand,
       COALESCE(r.reserved, 0)::bigint AS reserved,
       s.on_hand - COALESCE(r.reserved, 0)::bigint AS available
FROM inventory.stock s
LEFT JOIN (
    SELECT i.sku_id, sum(i.quantity) AS reserved
    FROM inventory.reservations r
    JOIN ordering.order_items i ON i.id = r.order_item_id
    WHERE r.status = 'active'
    GROUP BY i.sku_id
) r ON r.sku_id = s.sku_id;
CREATE VIEW merchant.ratings AS
SELECT o.store_id, count(*) AS rating_count, avg(r.rating) AS rating_average
FROM ordering.reviews r
JOIN ordering.merchant_orders o ON o.id = r.merchant_order_id
GROUP BY o.store_id;

-- INVARIANTES LOCALES ENTRE TABLAS. No sustituyen autorizacion ni casos de uso.
CREATE FUNCTION ordering.validate_order_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status_code <> 'pending' OR NEW.version <> 0 THEN
            RAISE EXCEPTION 'Un pedido nuevo debe empezar pending/version 0' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF NEW.purchase_id <> OLD.purchase_id OR NEW.store_id <> OLD.store_id
           OR NEW.delivery_fee_cents <> OLD.delivery_fee_cents THEN
            RAISE EXCEPTION 'La identidad y tarifa acordada del pedido son inmutables' USING ERRCODE = '23514';
        END IF;
        IF NEW.status_code <> OLD.status_code THEN
            IF NOT EXISTS (SELECT 1 FROM ordering.allowed_transitions
                           WHERE from_status = OLD.status_code AND to_status = NEW.status_code) THEN
                RAISE EXCEPTION 'Transicion de pedido invalida: % -> %', OLD.status_code, NEW.status_code
                    USING ERRCODE = '23514';
            END IF;
            NEW.version := OLD.version + 1;
            NEW.updated_at := now();
        ELSIF NEW.version <> OLD.version THEN
            RAISE EXCEPTION 'La version cambia solamente con el estado' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER merchant_orders_transition BEFORE INSERT OR UPDATE ON ordering.merchant_orders
    FOR EACH ROW EXECUTE FUNCTION ordering.validate_order_transition();

CREATE FUNCTION ordering.guard_order_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_store uuid;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'Las lineas de venta son inmutables; use cancelacion o devolucion' USING ERRCODE = '23514';
    END IF;
    SELECT o.store_id INTO v_store FROM ordering.merchant_orders o WHERE o.id = NEW.merchant_order_id;
    IF v_store IS DISTINCT FROM (
        SELECT p.store_id FROM catalog.skus s JOIN catalog.products p ON p.id = s.product_id WHERE s.id = NEW.sku_id
    ) THEN
        RAISE EXCEPTION 'El SKU no pertenece al comercio del pedido' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER order_items_guard BEFORE INSERT OR UPDATE OR DELETE ON ordering.order_items
    FOR EACH ROW EXECUTE FUNCTION ordering.guard_order_item();

CREATE FUNCTION platform.reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'Registro historico inmutable: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER purchase_destination_immutable BEFORE UPDATE OR DELETE ON ordering.purchase_destinations
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER order_events_immutable BEFORE UPDATE OR DELETE ON ordering.order_events
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER audit_entries_immutable BEFORE UPDATE OR DELETE ON platform.audit_entries
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER purchases_immutable BEFORE UPDATE OR DELETE ON ordering.purchases
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();
CREATE TRIGGER merchant_orders_no_delete BEFORE DELETE ON ordering.merchant_orders
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

CREATE FUNCTION inventory.guard_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_sku uuid; v_quantity integer; v_on_hand integer; v_reserved bigint;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'active' THEN
            RAISE EXCEPTION 'Una reserva debe empezar activa' USING ERRCODE = '23514';
        END IF;
        SELECT sku_id, quantity INTO v_sku, v_quantity FROM ordering.order_items WHERE id = NEW.order_item_id;
        SELECT on_hand INTO v_on_hand FROM inventory.stock WHERE sku_id = v_sku FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'SKU sin existencia inicializada' USING ERRCODE = '23514';
        END IF;
        SELECT COALESCE(sum(i.quantity), 0) INTO v_reserved
        FROM inventory.reservations r JOIN ordering.order_items i ON i.id = r.order_item_id
        WHERE i.sku_id = v_sku AND r.status = 'active';
        IF v_quantity > v_on_hand - v_reserved THEN
            RAISE EXCEPTION 'Stock disponible insuficiente' USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.order_item_id <> OLD.order_item_id OR OLD.status <> 'active'
          OR NEW.status NOT IN ('consumed', 'released') THEN
        RAISE EXCEPTION 'Reserva cerrada o transicion invalida' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reservations_guard BEFORE INSERT OR UPDATE ON inventory.reservations
    FOR EACH ROW EXECUTE FUNCTION inventory.guard_reservation();
CREATE TRIGGER reservations_no_delete BEFORE DELETE ON inventory.reservations
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

CREATE FUNCTION inventory.guard_stock() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_reserved bigint;
BEGIN
    IF NEW.sku_id <> OLD.sku_id THEN
        RAISE EXCEPTION 'No se puede cambiar el SKU del stock' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(i.quantity), 0) INTO v_reserved
    FROM inventory.reservations r JOIN ordering.order_items i ON i.id = r.order_item_id
    WHERE i.sku_id = NEW.sku_id AND r.status = 'active';
    IF NEW.on_hand < v_reserved THEN
        RAISE EXCEPTION 'La existencia fisica no puede ser menor que las reservas activas' USING ERRCODE = '23514';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;
CREATE TRIGGER stock_guard BEFORE UPDATE ON inventory.stock
    FOR EACH ROW EXECUTE FUNCTION inventory.guard_stock();
CREATE TRIGGER stock_no_delete BEFORE DELETE ON inventory.stock
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

CREATE FUNCTION billing.guard_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_total bigint;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'pending' THEN
            RAISE EXCEPTION 'Un intento de pago debe empezar pendiente' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF NEW.purchase_id <> OLD.purchase_id OR NEW.method_code <> OLD.method_code
           OR NEW.provider <> OLD.provider OR NEW.amount_cents <> OLD.amount_cents
           OR OLD.status IN ('succeeded', 'failed', 'cancelled')
           OR (OLD.status = 'processing' AND NEW.status = 'pending') THEN
            RAISE EXCEPTION 'Pago inmutable, cerrado o transicion invalida' USING ERRCODE = '23514';
        END IF;
        IF NEW.status = 'succeeded' THEN
            SELECT total_cents INTO v_total FROM ordering.purchase_totals WHERE purchase_id = NEW.purchase_id;
            IF NEW.amount_cents <> v_total OR v_total <= 0 THEN
                RAISE EXCEPTION 'El cobro debe cubrir exactamente la compra' USING ERRCODE = '23514';
            END IF;
            IF NEW.method_code = 'cash' AND (NEW.collected_by_user_id IS NULL OR EXISTS (
                SELECT 1 FROM ordering.merchant_orders
                WHERE purchase_id = NEW.purchase_id AND status_code <> 'delivered'
            )) THEN
                RAISE EXCEPTION 'Efectivo: registrar cobrador y completar entrega antes del cobro' USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER payment_attempts_guard BEFORE INSERT OR UPDATE ON billing.payment_attempts
    FOR EACH ROW EXECUTE FUNCTION billing.guard_payment();
CREATE TRIGGER payment_attempts_no_delete BEFORE DELETE ON billing.payment_attempts
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

CREATE FUNCTION billing.guard_refund() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v_payment billing.payment_attempts%ROWTYPE;
        v_order ordering.merchant_orders%ROWTYPE;
        v_refunded numeric;
        v_total bigint;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.payment_attempt_id <> OLD.payment_attempt_id OR NEW.merchant_order_id <> OLD.merchant_order_id
           OR NEW.amount_cents <> OLD.amount_cents OR NEW.request_key <> OLD.request_key
           OR OLD.status IN ('succeeded', 'failed')
           OR (OLD.status = 'processing' AND NEW.status = 'pending') THEN
            RAISE EXCEPTION 'Reembolso inmutable, cerrado o transicion invalida' USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.status <> 'pending' THEN
        RAISE EXCEPTION 'Un reembolso debe empezar pendiente' USING ERRCODE = '23514';
    END IF;
    -- Serializa reembolsos del mismo pago; no hacer llamadas HTTP bajo este lock.
    SELECT * INTO v_payment FROM billing.payment_attempts WHERE id = NEW.payment_attempt_id FOR UPDATE;
    SELECT * INTO v_order FROM ordering.merchant_orders WHERE id = NEW.merchant_order_id;
    IF v_payment.id IS NULL OR v_order.id IS NULL OR v_payment.purchase_id <> v_order.purchase_id THEN
        RAISE EXCEPTION 'El pago y el pedido no pertenecen a la misma compra' USING ERRCODE = '23514';
    END IF;
    IF v_payment.status <> 'succeeded' OR v_payment.method_code = 'cash'
       OR v_order.status_code NOT IN ('cancelled', 'rejected') THEN
        RAISE EXCEPTION 'Solo se reembolsa un pago digital cobrado de un pedido cancelado/rechazado'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.status <> 'failed' THEN
        SELECT COALESCE(sum(amount_cents), 0) INTO v_refunded FROM billing.refunds
            WHERE payment_attempt_id = NEW.payment_attempt_id AND id <> NEW.id
              AND status IN ('pending', 'processing', 'succeeded');
        SELECT total_cents INTO v_total FROM ordering.order_totals WHERE merchant_order_id = NEW.merchant_order_id;
        IF v_refunded + NEW.amount_cents > v_payment.amount_cents OR NEW.amount_cents > v_total THEN
            RAISE EXCEPTION 'El reembolso supera el importe cobrado o el importe del pedido' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER refunds_guard BEFORE INSERT OR UPDATE ON billing.refunds
    FOR EACH ROW EXECUTE FUNCTION billing.guard_refund();
CREATE TRIGGER refunds_no_delete BEFORE DELETE ON billing.refunds
    FOR EACH ROW EXECUTE FUNCTION platform.reject_mutation();

COMMENT ON SCHEMA identity IS 'Cuentas, roles y autenticacion; permisos de recurso se verifican en aplicacion';
COMMENT ON TABLE ordering.order_items IS 'Hechos historicos de venta; nombres y precio pactados no dependen del catalogo actual';
COMMENT ON TABLE inventory.stock IS 'Existencias fisicas; bloquear fila antes de leer disponibilidad y reservar/consumir/ajustar';
COMMENT ON TABLE billing.payment_attempts IS 'Intentos de cobro; referencia externa verificada, sin PAN ni CVV';
COMMENT ON TABLE platform.outbox_events IS 'Entrega al menos una vez; consumidores deben deduplicar por event id';
COMMENT ON TABLE platform.audit_entries IS 'Bitacora append-only; entity_id es referencia logica sin FK polimorfica';

-- Sin GRANT a PUBLIC. Crear roles de migracion/runtime/worker segun la guia.
-- updated_at de perfiles/catalogo se mantiene desde sus repositorios de aplicacion.
COMMIT;
