-- DEMO balances only. No card data or real payment instructions are stored.
-- Run after 011_auth.sql. Existing migrations remain unchanged.
BEGIN;

CREATE TABLE IF NOT EXISTS demo_wallets (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
    balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT demo_wallets_balance_range CHECK (balance >= 0 AND balance <= 900000000 AND balance <> 'NaN'::numeric)
);

-- One platform account shared by all administrators, never an admin's personal wallet.
CREATE TABLE IF NOT EXISTS demo_platform_wallet (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT demo_platform_wallet_balance_range CHECK (balance >= 0 AND balance <= 900000000 AND balance <> 'NaN'::numeric)
);
INSERT INTO demo_platform_wallet(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS demo_wallet_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES demo_wallets(user_id) ON DELETE RESTRICT,
    platform_id SMALLINT REFERENCES demo_platform_wallet(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'TOP_UP', 'ORDER_PAYMENT', 'FARMER_PAYOUT', 'TRANSPORTER_PAYOUT', 'PLATFORM_FEE', 'CASH_OUT'
    )),
    direction TEXT NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0 AND amount <> 'NaN'::numeric),
    event_key TEXT NOT NULL UNIQUE CHECK (btrim(event_key) <> ''),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT demo_wallet_events_one_account CHECK ((user_id IS NULL) <> (platform_id IS NULL)),
    CONSTRAINT demo_wallet_events_order_scope CHECK (
        (event_type IN ('TOP_UP', 'CASH_OUT') AND order_id IS NULL)
        OR (event_type NOT IN ('TOP_UP', 'CASH_OUT') AND order_id IS NOT NULL)
    ),
    CONSTRAINT demo_wallet_events_direction CHECK (
        (event_type IN ('TOP_UP', 'FARMER_PAYOUT', 'TRANSPORTER_PAYOUT', 'PLATFORM_FEE') AND direction = 'CREDIT')
        OR (event_type IN ('ORDER_PAYMENT', 'CASH_OUT') AND direction = 'DEBIT')
    ),
    CONSTRAINT demo_wallet_events_platform_scope CHECK ((event_type = 'PLATFORM_FEE') = (platform_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_demo_wallet_events_user_created
    ON demo_wallet_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_demo_wallet_events_order_type
    ON demo_wallet_events(order_id, event_type) WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_demo_wallet_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'demo_wallet_events is append-only' USING ERRCODE = '55000';
END;
$$;
DROP TRIGGER IF EXISTS trg_demo_wallet_events_append_only ON demo_wallet_events;
CREATE TRIGGER trg_demo_wallet_events_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON demo_wallet_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_demo_wallet_event_mutation();
ALTER TABLE demo_wallet_events ENABLE ALWAYS TRIGGER trg_demo_wallet_events_append_only;
REVOKE UPDATE, DELETE, TRUNCATE ON demo_wallet_events FROM PUBLIC;

COMMIT;
