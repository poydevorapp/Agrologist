-- Agrologistik Marketplace
-- Reviews and manually resolved disputes.
-- Requires database/001_extensions.sql, database/002_identity.sql, and
-- database/004_orders.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS reviews (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id          UUID NOT NULL,
    reviewer_id       UUID NOT NULL,
    reviewed_user_id  UUID NOT NULL,
    rating            SMALLINT NOT NULL,
    comment           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT reviews_order_counterpart_unique
        UNIQUE (order_id, reviewer_id, reviewed_user_id),
    CONSTRAINT reviews_order_fk
        FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE RESTRICT,
    CONSTRAINT reviews_reviewer_fk
        FOREIGN KEY (reviewer_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT reviews_reviewed_user_fk
        FOREIGN KEY (reviewed_user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT reviews_rating_range
        CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT reviews_distinct_users
        CHECK (reviewer_id <> reviewed_user_id),
    CONSTRAINT reviews_comment_not_blank
        CHECK (comment IS NULL OR btrim(comment) <> '')
);

-- A row-level CHECK cannot inspect orders, so validate completion and parties
-- under an order-row lock. The lock prevents a concurrent status change from
-- racing with review creation.
CREATE OR REPLACE FUNCTION validate_review_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_buyer_id  UUID;
    v_farmer_id UUID;
    v_status    TEXT;
BEGIN
    SELECT o.buyer_id, o.farmer_id, o.status
    INTO v_buyer_id, v_farmer_id, v_status
    FROM orders AS o
    WHERE o.id = NEW.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', NEW.order_id
            USING ERRCODE = '23503';
    END IF;

    IF v_status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Order % must be COMPLETED before it can be reviewed',
            NEW.order_id
            USING ERRCODE = '23514';
    END IF;

    IF NOT (
        (NEW.reviewer_id = v_buyer_id AND NEW.reviewed_user_id = v_farmer_id)
        OR
        (NEW.reviewer_id = v_farmer_id AND NEW.reviewed_user_id = v_buyer_id)
    ) THEN
        RAISE EXCEPTION
            'Review users must be the buyer and farmer for order %',
            NEW.order_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_validate_order ON reviews;

CREATE TRIGGER trg_reviews_validate_order
BEFORE INSERT OR UPDATE OF order_id, reviewer_id, reviewed_user_id ON reviews
FOR EACH ROW
EXECUTE FUNCTION validate_review_order();

CREATE TABLE IF NOT EXISTS disputes (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL,
    opened_by    UUID NOT NULL,
    reason       TEXT NOT NULL,
    description  TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'OPEN',
    resolution   TEXT,
    resolved_by  UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at  TIMESTAMPTZ,

    CONSTRAINT disputes_order_fk
        FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE RESTRICT,
    CONSTRAINT disputes_opened_by_fk
        FOREIGN KEY (opened_by)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT disputes_resolved_by_fk
        FOREIGN KEY (resolved_by)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT disputes_reason_not_blank
        CHECK (btrim(reason) <> ''),
    CONSTRAINT disputes_description_not_blank
        CHECK (btrim(description) <> ''),
    CONSTRAINT disputes_resolution_not_blank
        CHECK (resolution IS NULL OR btrim(resolution) <> ''),
    CONSTRAINT disputes_status_allowed
        CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
    CONSTRAINT disputes_resolution_fields_match_status
        CHECK (
            (
                status IN ('RESOLVED', 'REJECTED')
                AND resolved_by IS NOT NULL
                AND resolved_at IS NOT NULL
            )
            OR
            (
                status IN ('OPEN', 'UNDER_REVIEW')
                AND resolution IS NULL
                AND resolved_by IS NULL
                AND resolved_at IS NULL
            )
        ),
    CONSTRAINT disputes_resolution_time_not_before_creation
        CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

-- Terminal decisions are manual. The referenced resolver must hold ADMIN at
-- the time the decision is written; the membership row is locked until commit.
CREATE OR REPLACE FUNCTION validate_dispute_resolver()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IN ('RESOLVED', 'REJECTED') THEN
        PERFORM 1
        FROM user_roles AS ur
        JOIN roles AS r ON r.id = ur.role_id
        WHERE ur.user_id = NEW.resolved_by
          AND r.name = 'ADMIN'
        FOR KEY SHARE OF ur;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Dispute resolver % must have the ADMIN role',
                NEW.resolved_by
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disputes_validate_resolver ON disputes;

CREATE TRIGGER trg_disputes_validate_resolver
BEFORE INSERT OR UPDATE OF status, resolved_by ON disputes
FOR EACH ROW
EXECUTE FUNCTION validate_dispute_resolver();

COMMIT;
