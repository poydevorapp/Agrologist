-- Agrologistik Marketplace
-- Local authentication credentials and revocable refresh sessions.
-- Existing identity migrations remain unchanged.

BEGIN;

CREATE TABLE IF NOT EXISTS auth_credentials (
    user_id        UUID PRIMARY KEY,
    password_hash  TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT auth_credentials_user_fk
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT auth_credentials_password_hash_not_blank
        CHECK (btrim(password_hash) <> '')
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT auth_sessions_user_fk
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT auth_sessions_token_hash_not_blank
        CHECK (btrim(token_hash) <> ''),
    CONSTRAINT auth_sessions_expiry_valid
        CHECK (expires_at > created_at),
    CONSTRAINT auth_sessions_revocation_valid
        CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_active
    ON auth_sessions (user_id, expires_at)
    WHERE revoked_at IS NULL;

COMMIT;
