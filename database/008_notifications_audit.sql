-- Agrologistik Marketplace
-- User notifications and append-only audit logs.
-- Requires database/001_extensions.sql and database/002_identity.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    channel     TEXT NOT NULL DEFAULT 'IN_APP',
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT notifications_user_fk
        FOREIGN KEY (user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT,
    CONSTRAINT notifications_type_not_blank
        CHECK (btrim(type) <> ''),
    CONSTRAINT notifications_title_not_blank
        CHECK (btrim(title) <> ''),
    CONSTRAINT notifications_message_not_blank
        CHECK (btrim(message) <> ''),
    CONSTRAINT notifications_channel_allowed
        CHECK (channel IN ('IN_APP', 'PUSH', 'SMS', 'TELEGRAM')),
    CONSTRAINT notifications_read_time_not_before_creation
        CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
    ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id  UUID,
    action         TEXT NOT NULL,
    entity_type    TEXT NOT NULL,
    entity_id      UUID,
    metadata       JSONB,
    ip_address     INET,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT audit_logs_actor_user_fk
        FOREIGN KEY (actor_user_id)
        REFERENCES users (id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT audit_logs_action_not_blank
        CHECK (btrim(action) <> ''),
    CONSTRAINT audit_logs_entity_type_not_blank
        CHECK (btrim(entity_type) <> ''),
    CONSTRAINT audit_logs_metadata_is_object
        CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object'),
    CONSTRAINT audit_logs_metadata_has_no_core_fields
        CHECK (
            metadata IS NULL
            OR NOT (
                metadata ?| ARRAY[
                    'id',
                    'actor_user_id',
                    'action',
                    'entity_type',
                    'entity_id',
                    'ip_address',
                    'created_at'
                ]
            )
        ),
    -- Reject secret-bearing keys at any JSON nesting level. This is a guardrail;
    -- callers must also redact secrets hidden inside otherwise innocent values.
    CONSTRAINT audit_logs_metadata_has_no_sensitive_keys
        CHECK (
            metadata IS NULL
            OR metadata::TEXT !~* '"[^"]*(password|passwd|pwd|otp|one[_ -]?time[_ -]?password|access[_ -]?token|refresh[_ -]?token|token|secret|authorization|api[_ -]?key|payment[_ -]?(secret|token)|card[_ -]?number|cvv|cvc|pin)[^"]*"[[:space:]]*:'
        )
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at
    ON audit_logs (actor_user_id, created_at DESC)
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created_at
    ON audit_logs (entity_type, entity_id, created_at DESC)
    WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs (created_at DESC);

CREATE OR REPLACE FUNCTION reject_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'audit_logs is append-only; UPDATE, DELETE and TRUNCATE are forbidden'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;

CREATE TRIGGER trg_audit_logs_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
FOR EACH STATEMENT
EXECUTE FUNCTION reject_audit_log_mutation();

ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER trg_audit_logs_append_only;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM PUBLIC;

COMMIT;
