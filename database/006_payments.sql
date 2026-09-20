-- Agrologistik Marketplace
-- Payment attempts and demo escrow allocations.
-- No real provider or banking integration is performed here.
-- Requires database/001_extensions.sql and database/004_orders.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS payments (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                 UUID NOT NULL,
    provider                 TEXT NOT NULL,
    provider_transaction_id  TEXT,
    amount                   NUMERIC(14, 2) NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'PENDING',
    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT payments_provider_transaction_unique
        UNIQUE (provider, provider_transaction_id),
    CONSTRAINT payments_order_fk
        FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE RESTRICT,
    CONSTRAINT payments_provider_allowed
        CHECK (provider IN ('DEMO', 'PAYME', 'CLICK', 'UZUM', 'OTHER')),
    CONSTRAINT payments_provider_transaction_not_blank
        CHECK (
            provider_transaction_id IS NULL
            OR btrim(provider_transaction_id) <> ''
        ),
    CONSTRAINT payments_non_demo_has_transaction_id
        CHECK (provider = 'DEMO' OR provider_transaction_id IS NOT NULL),
    CONSTRAINT payments_amount_nonnegative
        CHECK (amount >= 0),
    CONSTRAINT payments_status_allowed
        CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'REFUNDED'))
);

CREATE TABLE IF NOT EXISTS escrow_accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL,
    gross_amount        NUMERIC(14, 2) NOT NULL,
    platform_fee        NUMERIC(14, 2) NOT NULL,
    farmer_amount       NUMERIC(14, 2) NOT NULL,
    transporter_amount  NUMERIC(14, 2) NOT NULL,
    status              TEXT NOT NULL DEFAULT 'CREATED',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at         TIMESTAMPTZ,

    CONSTRAINT escrow_accounts_order_unique
        UNIQUE (order_id),
    CONSTRAINT escrow_accounts_order_fk
        FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE RESTRICT,
    CONSTRAINT escrow_accounts_gross_amount_nonnegative
        CHECK (gross_amount >= 0),
    CONSTRAINT escrow_accounts_platform_fee_nonnegative
        CHECK (platform_fee >= 0),
    CONSTRAINT escrow_accounts_farmer_amount_nonnegative
        CHECK (farmer_amount >= 0),
    CONSTRAINT escrow_accounts_transporter_amount_nonnegative
        CHECK (transporter_amount >= 0),
    CONSTRAINT escrow_accounts_amounts_balance
        CHECK (
            platform_fee + farmer_amount + transporter_amount = gross_amount
        ),
    CONSTRAINT escrow_accounts_status_allowed
        CHECK (
            status IN (
                'CREATED',
                'FUNDED',
                'LOCKED',
                'RELEASED',
                'REFUND_PENDING',
                'REFUNDED'
            )
        ),
    CONSTRAINT escrow_accounts_released_status_has_time
        CHECK (status <> 'RELEASED' OR released_at IS NOT NULL),
    CONSTRAINT escrow_accounts_released_time_not_before_creation
        CHECK (released_at IS NULL OR released_at >= created_at)
);

-- Composite keys enforce that ledger references belong to its order.
-- Upgrade previously applied schemas too: NUMERIC NaN passes a >= 0 check.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'payments'::regclass
                     AND conname = 'payments_amount_not_nan') THEN
        ALTER TABLE payments ADD CONSTRAINT payments_amount_not_nan
            CHECK (amount <> 'NaN'::NUMERIC);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = 'escrow_accounts'::regclass
                     AND conname = 'escrow_accounts_amounts_not_nan') THEN
        ALTER TABLE escrow_accounts ADD CONSTRAINT escrow_accounts_amounts_not_nan
            CHECK (gross_amount <> 'NaN'::NUMERIC
                AND platform_fee <> 'NaN'::NUMERIC
                AND farmer_amount <> 'NaN'::NUMERIC
                AND transporter_amount <> 'NaN'::NUMERIC);
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_id_order
    ON payments (id, order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_escrow_accounts_id_order
    ON escrow_accounts (id, order_id);

CREATE TABLE IF NOT EXISTS financial_ledger (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL,
    payment_id  UUID,
    escrow_id   UUID,
    entry_type  TEXT NOT NULL,
    amount      NUMERIC(14, 2) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata    JSONB,
    -- A stable business-event identifier, reused on retries, not per attempt.
    event_key   TEXT NOT NULL,

    CONSTRAINT financial_ledger_event_key_unique UNIQUE (event_key),
    CONSTRAINT financial_ledger_event_key_valid
        CHECK (event_key = btrim(event_key) AND event_key <> ''),
    CONSTRAINT financial_ledger_order_fk FOREIGN KEY (order_id)
        REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT financial_ledger_payment_order_fk FOREIGN KEY (payment_id, order_id)
        REFERENCES payments (id, order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT financial_ledger_escrow_order_fk FOREIGN KEY (escrow_id, order_id)
        REFERENCES escrow_accounts (id, order_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT financial_ledger_amount_positive
        CHECK (amount > 0 AND amount <> 'NaN'::NUMERIC),
    CONSTRAINT financial_ledger_entry_type_allowed CHECK (entry_type IN (
        'BUYER_PAYMENT', 'ESCROW_FUNDED', 'PLATFORM_FEE',
        'FARMER_PAYOUT', 'TRANSPORTER_PAYOUT', 'REFUND'
    )),
    CONSTRAINT financial_ledger_source_required CHECK (
        (entry_type = 'BUYER_PAYMENT' AND payment_id IS NOT NULL)
        OR (entry_type IN ('ESCROW_FUNDED', 'PLATFORM_FEE',
                          'FARMER_PAYOUT', 'TRANSPORTER_PAYOUT') AND escrow_id IS NOT NULL)
        OR (entry_type = 'REFUND' AND (payment_id IS NOT NULL OR escrow_id IS NOT NULL))
    ),
    CONSTRAINT financial_ledger_metadata_object
        CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object'),
    CONSTRAINT financial_ledger_metadata_no_core_fields CHECK (
        metadata IS NULL OR NOT (metadata ?| ARRAY[
            'id', 'order_id', 'payment_id', 'escrow_id', 'entry_type',
            'amount', 'created_at', 'event_key'
        ])
    )
);

CREATE INDEX IF NOT EXISTS idx_financial_ledger_order_created_at
    ON financial_ledger (order_id, created_at);
-- One receipt per payment; retries with a fresh event key still cannot duplicate it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_ledger_buyer_payment
    ON financial_ledger (payment_id) WHERE entry_type = 'BUYER_PAYMENT';

CREATE OR REPLACE FUNCTION reject_financial_ledger_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'financial_ledger is append-only; UPDATE, DELETE and TRUNCATE are forbidden'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_financial_ledger_append_only ON financial_ledger;
CREATE TRIGGER trg_financial_ledger_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON financial_ledger
FOR EACH STATEMENT EXECUTE FUNCTION reject_financial_ledger_mutation();
ALTER TABLE financial_ledger ENABLE ALWAYS TRIGGER trg_financial_ledger_append_only;
REVOKE UPDATE, DELETE, TRUNCATE ON financial_ledger FROM PUBLIC;

COMMIT;
