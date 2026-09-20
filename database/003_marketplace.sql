-- Agrologistik Marketplace
-- Product catalog, listings, and listing images schema.
-- Requires database/001_extensions.sql and database/002_identity.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT categories_name_unique
        UNIQUE (name),
    CONSTRAINT categories_name_not_blank
        CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS products (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id  UUID NOT NULL,
    name         TEXT NOT NULL,
    unit_type    TEXT NOT NULL,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT products_category_name_unique
        UNIQUE (category_id, name),
    CONSTRAINT products_category_fk
        FOREIGN KEY (category_id)
        REFERENCES categories (id)
        ON DELETE RESTRICT,
    CONSTRAINT products_name_not_blank
        CHECK (btrim(name) <> ''),
    CONSTRAINT products_unit_type_allowed
        CHECK (unit_type IN ('KG', 'TON', 'PIECE'))
);

CREATE TABLE IF NOT EXISTS listings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    farmer_id           UUID NOT NULL,
    product_id          UUID NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    original_quantity   NUMERIC(12, 2) NOT NULL,
    available_quantity  NUMERIC(12, 2) NOT NULL,
    unit                TEXT NOT NULL,
    price_per_unit      NUMERIC(14, 2) NOT NULL,
    region              TEXT NOT NULL,
    district            TEXT NOT NULL,
    latitude            NUMERIC(9, 6),
    longitude           NUMERIC(9, 6),
    status              TEXT NOT NULL DEFAULT 'DRAFT',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT listings_farmer_fk
        FOREIGN KEY (farmer_id)
        REFERENCES farmer_profiles (user_id)
        ON DELETE RESTRICT,
    CONSTRAINT listings_product_fk
        FOREIGN KEY (product_id)
        REFERENCES products (id)
        ON DELETE RESTRICT,
    CONSTRAINT listings_title_not_blank
        CHECK (btrim(title) <> ''),
    CONSTRAINT listings_description_not_blank
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT listings_original_quantity_positive
        CHECK (original_quantity > 0),
    CONSTRAINT listings_available_quantity_nonnegative
        CHECK (available_quantity >= 0),
    CONSTRAINT listings_available_not_above_original
        CHECK (available_quantity <= original_quantity),
    CONSTRAINT listings_unit_allowed
        CHECK (unit IN ('KG', 'TON', 'PIECE')),
    CONSTRAINT listings_price_per_unit_nonnegative
        CHECK (price_per_unit >= 0),
    CONSTRAINT listings_region_not_blank
        CHECK (btrim(region) <> ''),
    CONSTRAINT listings_district_not_blank
        CHECK (btrim(district) <> ''),
    CONSTRAINT listings_latitude_range
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT listings_longitude_range
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT listings_coordinates_together
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT listings_status_allowed
        CHECK (
            status IN (
                'DRAFT',
                'PENDING',
                'ACTIVE',
                'RESERVED',
                'SOLD',
                'CANCELLED',
                'REJECTED'
            )
        )
);

CREATE TABLE IF NOT EXISTS listing_images (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id   UUID NOT NULL,
    storage_key  TEXT NOT NULL,
    sort_order   INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT listing_images_storage_key_unique
        UNIQUE (storage_key),
    CONSTRAINT listing_images_listing_sort_order_unique
        UNIQUE (listing_id, sort_order),
    CONSTRAINT listing_images_listing_fk
        FOREIGN KEY (listing_id)
        REFERENCES listings (id)
        ON DELETE CASCADE,
    CONSTRAINT listing_images_storage_key_not_blank
        CHECK (btrim(storage_key) <> ''),
    CONSTRAINT listing_images_sort_order_nonnegative
        CHECK (sort_order >= 0)
);

INSERT INTO categories (name)
VALUES
    ('Kartoshka'),
    ('Sabzavot'),
    ('Meva'),
    ('Poliz')
ON CONFLICT (name) DO NOTHING;

COMMIT;
