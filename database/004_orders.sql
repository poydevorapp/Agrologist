-- Agrologistik Marketplace
-- Orders and immutable item price snapshots.
-- Requires database/001_extensions.sql, database/002_identity.sql, and
-- database/003_marketplace.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS orders (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id      UUID NOT NULL,
    farmer_id     UUID NOT NULL,
    status        TEXT NOT NULL DEFAULT 'PENDING',
    subtotal      NUMERIC(14, 2) NOT NULL,
    delivery_fee  NUMERIC(14, 2) NOT NULL DEFAULT 0,
    total_amount  NUMERIC(14, 2) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT orders_buyer_fk
        FOREIGN KEY (buyer_id)
        REFERENCES buyer_profiles (user_id)
        ON DELETE RESTRICT,
    CONSTRAINT orders_farmer_fk
        FOREIGN KEY (farmer_id)
        REFERENCES farmer_profiles (user_id)
        ON DELETE RESTRICT,
    CONSTRAINT orders_distinct_parties
        CHECK (buyer_id <> farmer_id),
    CONSTRAINT orders_status_allowed
        CHECK (
            status IN (
                'PENDING',
                'CONFIRMED',
                'TRANSPORT_PENDING',
                'TRANSPORT_ASSIGNED',
                'IN_TRANSIT',
                'DELIVERED',
                'COMPLETED',
                'CANCELLED',
                'DISPUTED'
            )
        ),
    CONSTRAINT orders_subtotal_nonnegative
        CHECK (subtotal >= 0),
    CONSTRAINT orders_delivery_fee_nonnegative
        CHECK (delivery_fee >= 0),
    CONSTRAINT orders_total_amount_nonnegative
        CHECK (total_amount >= 0),
    CONSTRAINT orders_total_amount_matches_components
        CHECK (total_amount = subtotal + delivery_fee)
);

CREATE TABLE IF NOT EXISTS order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL,
    listing_id  UUID NOT NULL,
    quantity    NUMERIC(12, 2) NOT NULL,
    unit_price  NUMERIC(14, 2) NOT NULL,
    line_total  NUMERIC(14, 2) NOT NULL,

    CONSTRAINT order_items_order_listing_unique
        UNIQUE (order_id, listing_id),
    CONSTRAINT order_items_order_fk
        FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE RESTRICT,
    CONSTRAINT order_items_listing_fk
        FOREIGN KEY (listing_id)
        REFERENCES listings (id)
        ON DELETE RESTRICT,
    CONSTRAINT order_items_quantity_positive
        CHECK (quantity > 0),
    CONSTRAINT order_items_unit_price_nonnegative
        CHECK (unit_price >= 0),
    CONSTRAINT order_items_line_total_nonnegative
        CHECK (line_total >= 0),
    CONSTRAINT order_items_line_total_matches_values
        CHECK (line_total = round(quantity * unit_price, 2))
);

CREATE TABLE IF NOT EXISTS order_status_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         UUID NOT NULL,
    previous_status  TEXT,
    new_status       TEXT NOT NULL,
    changed_by       UUID,
    note             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT order_status_history_order_fk
        FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE RESTRICT,
    CONSTRAINT order_status_history_changed_by_fk
        FOREIGN KEY (changed_by)
        REFERENCES users (id)
        ON DELETE SET NULL,
    CONSTRAINT order_status_history_previous_status_allowed
        CHECK (
            previous_status IS NULL
            OR previous_status IN (
                'PENDING',
                'CONFIRMED',
                'TRANSPORT_PENDING',
                'TRANSPORT_ASSIGNED',
                'IN_TRANSIT',
                'DELIVERED',
                'COMPLETED',
                'CANCELLED',
                'DISPUTED'
            )
        ),
    CONSTRAINT order_status_history_new_status_allowed
        CHECK (
            new_status IN (
                'PENDING',
                'CONFIRMED',
                'TRANSPORT_PENDING',
                'TRANSPORT_ASSIGNED',
                'IN_TRANSIT',
                'DELIVERED',
                'COMPLETED',
                'CANCELLED',
                'DISPUTED'
            )
        ),
    CONSTRAINT order_status_history_status_changed
        CHECK (previous_status IS NULL OR previous_status <> new_status),
    CONSTRAINT order_status_history_note_not_blank
        CHECK (note IS NULL OR btrim(note) <> '')
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_created_at
    ON order_status_history (order_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_status_history_initial
    ON order_status_history (order_id)
    WHERE previous_status IS NULL;

-- Set app.changed_by and app.status_note with SET LOCAL before changing an
-- order when actor and note context are available. Both remain nullable.
CREATE OR REPLACE FUNCTION record_order_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_changed_by UUID;
    v_note       TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
        RETURN NEW;
    END IF;

    v_changed_by := NULLIF(
        btrim(current_setting('app.changed_by', TRUE)),
        ''
    )::UUID;
    v_note := NULLIF(
        btrim(current_setting('app.status_note', TRUE)),
        ''
    );

    INSERT INTO order_status_history (
        order_id,
        previous_status,
        new_status,
        changed_by,
        note
    )
    VALUES (
        NEW.id,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
        NEW.status,
        v_changed_by,
        v_note
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_status_history ON orders;

CREATE TRIGGER trg_orders_status_history
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION record_order_status_history();

-- Give orders created before this migration one initial history record.
INSERT INTO order_status_history (
    order_id,
    previous_status,
    new_status,
    created_at
)
SELECT
    o.id,
    NULL,
    o.status,
    o.created_at
FROM orders AS o
WHERE NOT EXISTS (
    SELECT 1
    FROM order_status_history AS h
    WHERE h.order_id = o.id
      AND h.previous_status IS NULL
);

-- Call this function inside the same transaction that inserts the order and
-- its item. The row lock is held until COMMIT or ROLLBACK.
CREATE OR REPLACE FUNCTION reserve_listing_stock(
    p_listing_id UUID,
    p_quantity   NUMERIC
)
RETURNS TABLE (
    listing_id         UUID,
    farmer_id          UUID,
    unit_price         NUMERIC(14, 2),
    reserved_quantity  NUMERIC(12, 2),
    remaining_quantity NUMERIC(12, 2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_listing   listings%ROWTYPE;
    v_remaining NUMERIC(12, 2);
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Requested quantity must be greater than zero'
            USING ERRCODE = '22023';
    END IF;

    IF p_quantity <> round(p_quantity, 2) THEN
        RAISE EXCEPTION 'Requested quantity cannot have more than two decimal places'
            USING ERRCODE = '22023';
    END IF;

    SELECT l.*
    INTO v_listing
    FROM listings AS l
    WHERE l.id = p_listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing % does not exist', p_listing_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_listing.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Listing % is not active', p_listing_id
            USING ERRCODE = '55000';
    END IF;

    IF v_listing.available_quantity < p_quantity THEN
        RAISE EXCEPTION
            'Insufficient stock for listing %: requested %, available %',
            p_listing_id,
            p_quantity,
            v_listing.available_quantity
            USING ERRCODE = '23514';
    END IF;

    UPDATE listings AS l
    SET available_quantity = l.available_quantity - p_quantity,
        status = CASE
            WHEN l.available_quantity - p_quantity = 0 THEN 'RESERVED'
            ELSE l.status
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE l.id = p_listing_id
    RETURNING l.available_quantity INTO v_remaining;

    RETURN QUERY
    SELECT
        v_listing.id,
        v_listing.farmer_id,
        v_listing.price_per_unit,
        p_quantity::NUMERIC(12, 2),
        v_remaining;
END;
$$;

COMMIT;
