-- Agrologistik Marketplace
-- Identity schema.
-- Requires database/001_extensions.sql for gen_random_uuid().

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       TEXT NOT NULL UNIQUE,
    email       TEXT UNIQUE,
    full_name   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT users_phone_not_blank
        CHECK (btrim(phone) <> ''),
    CONSTRAINT users_email_not_blank
        CHECK (email IS NULL OR btrim(email) <> ''),
    CONSTRAINT users_full_name_not_blank
        CHECK (btrim(full_name) <> ''),
    CONSTRAINT users_status_allowed
        CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'))
);

CREATE TABLE IF NOT EXISTS roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT roles_name_allowed
        CHECK (name IN ('FARMER', 'BUYER', 'TRANSPORTER', 'ADMIN'))
);

CREATE TABLE IF NOT EXISTS user_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    role_id     UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT user_roles_user_role_unique
        UNIQUE (user_id, role_id),
    CONSTRAINT user_roles_user_fk
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT user_roles_role_fk
        FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS identity_verifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    provider          TEXT NOT NULL,
    provider_subject  TEXT,
    status            TEXT NOT NULL DEFAULT 'PENDING',
    verified_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT identity_verifications_user_provider_unique
        UNIQUE (user_id, provider),
    CONSTRAINT identity_verifications_provider_subject_unique
        UNIQUE (provider, provider_subject),
    CONSTRAINT identity_verifications_user_fk
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT identity_verifications_provider_allowed
        CHECK (provider IN ('PHONE', 'ONE_ID', 'MANUAL')),
    CONSTRAINT identity_verifications_status_allowed
        CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    CONSTRAINT identity_verifications_provider_subject_not_blank
        CHECK (provider_subject IS NULL OR btrim(provider_subject) <> ''),
    CONSTRAINT identity_verifications_one_id_has_subject
        CHECK (provider <> 'ONE_ID' OR provider_subject IS NOT NULL),
    CONSTRAINT identity_verifications_verified_at_matches_status
        CHECK (
            (status = 'VERIFIED' AND verified_at IS NOT NULL)
            OR (status <> 'VERIFIED' AND verified_at IS NULL)
        )
);

CREATE TABLE IF NOT EXISTS farmer_profiles (
    user_id              UUID PRIMARY KEY,
    farm_name            TEXT,
    region               TEXT NOT NULL,
    district             TEXT NOT NULL,
    description          TEXT,
    verification_status  TEXT NOT NULL DEFAULT 'PENDING',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT farmer_profiles_user_fk
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT farmer_profiles_farm_name_not_blank
        CHECK (farm_name IS NULL OR btrim(farm_name) <> ''),
    CONSTRAINT farmer_profiles_region_not_blank
        CHECK (btrim(region) <> ''),
    CONSTRAINT farmer_profiles_district_not_blank
        CHECK (btrim(district) <> ''),
    CONSTRAINT farmer_profiles_description_not_blank
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT farmer_profiles_verification_status_allowed
        CHECK (verification_status IN ('PENDING', 'VERIFIED', 'REJECTED'))
);

CREATE TABLE IF NOT EXISTS buyer_profiles (
    user_id            UUID PRIMARY KEY,
    buyer_type         TEXT NOT NULL,
    organization_name  TEXT,
    region             TEXT NOT NULL,
    district           TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT buyer_profiles_user_fk
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT buyer_profiles_buyer_type_allowed
        CHECK (buyer_type IN ('INDIVIDUAL', 'BUSINESS')),
    CONSTRAINT buyer_profiles_organization_name_not_blank
        CHECK (organization_name IS NULL OR btrim(organization_name) <> ''),
    CONSTRAINT buyer_profiles_business_has_organization
        CHECK (buyer_type <> 'BUSINESS' OR organization_name IS NOT NULL),
    CONSTRAINT buyer_profiles_region_not_blank
        CHECK (btrim(region) <> ''),
    CONSTRAINT buyer_profiles_district_not_blank
        CHECK (btrim(district) <> '')
);

CREATE TABLE IF NOT EXISTS transporter_profiles (
    user_id              UUID PRIMARY KEY,
    service_region       TEXT,
    availability_status  TEXT NOT NULL DEFAULT 'OFFLINE',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT transporter_profiles_user_fk
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT transporter_profiles_service_region_not_blank
        CHECK (service_region IS NULL OR btrim(service_region) <> ''),
    CONSTRAINT transporter_profiles_availability_status_allowed
        CHECK (availability_status IN ('AVAILABLE', 'BUSY', 'OFFLINE'))
);

INSERT INTO roles (name)
VALUES
    ('FARMER'),
    ('BUYER'),
    ('TRANSPORTER'),
    ('ADMIN')
ON CONFLICT (name) DO NOTHING;

COMMIT;
