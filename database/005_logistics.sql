-- Agrologistik Marketplace
-- Logistics schema: vehicles, shipments, events, and transport offers.
-- Requires database/001_extensions.sql, database/002_identity.sql, and
-- database/004_orders.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS vehicles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transporter_id  UUID NOT NULL,
    vehicle_type    TEXT NOT NULL,
    plate_number    TEXT NOT NULL UNIQUE,
    capacity_kg     NUMERIC(12, 2) NOT NULL,
    refrigerated    BOOLEAN NOT NULL DEFAULT FALSE,
    status          TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT vehicles_transporter_fk
        FOREIGN KEY (transporter_id)
        REFERENCES transporter_profiles (user_id)
        ON DELETE CASCADE,
    CONSTRAINT vehicles_vehicle_type_allowed
        CHECK (
            vehicle_type IN (
                'TRUCK',
                'VAN',
                'PICKUP',
                'MOTORCYCLE',
                'TRACTOR_TRAILER'
            )
        ),
    CONSTRAINT vehicles_plate_number_not_blank
        CHECK (btrim(plate_number) <> ''),
    CONSTRAINT vehicles_capacity_kg_positive
        CHECK (capacity_kg > 0),
    CONSTRAINT vehicles_status_allowed
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE'))
);

-- Supports the composite shipment FK that guarantees a vehicle belongs to
-- the transporter assigned to that shipment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicles_id_transporter
    ON vehicles (id, transporter_id);

CREATE TABLE IF NOT EXISTS shipments (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id               UUID NOT NULL,
    transporter_id         UUID,
    vehicle_id             UUID,
    status                 TEXT NOT NULL DEFAULT 'PENDING',
    pickup_latitude        NUMERIC(9, 6),
    pickup_longitude       NUMERIC(9, 6),
    destination_latitude   NUMERIC(9, 6),
    destination_longitude  NUMERIC(9, 6),
    pickup_time            TIMESTAMPTZ,
    delivered_time         TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT shipments_order_unique
        UNIQUE (order_id),
    CONSTRAINT shipments_order_fk
        FOREIGN KEY (order_id)
        REFERENCES orders (id)
        ON DELETE RESTRICT,
    CONSTRAINT shipments_transporter_fk
        FOREIGN KEY (transporter_id)
        REFERENCES transporter_profiles (user_id)
        ON DELETE RESTRICT,
    CONSTRAINT shipments_vehicle_fk
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles (id)
        ON DELETE RESTRICT,
    CONSTRAINT shipments_vehicle_transporter_fk
        FOREIGN KEY (vehicle_id, transporter_id)
        REFERENCES vehicles (id, transporter_id)
        ON DELETE RESTRICT,
    CONSTRAINT shipments_status_allowed
        CHECK (
            status IN (
                'PENDING',
                'ASSIGNED',
                'PICKED_UP',
                'IN_TRANSIT',
                'DELIVERED',
                'CANCELLED'
            )
        ),
    CONSTRAINT shipments_assignment_together
        CHECK ((transporter_id IS NULL) = (vehicle_id IS NULL)),
    CONSTRAINT shipments_pending_unassigned
        CHECK (
            status <> 'PENDING'
            OR (transporter_id IS NULL AND vehicle_id IS NULL)
        ),
    CONSTRAINT shipments_active_status_has_assignment
        CHECK (
            status NOT IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED')
            OR (transporter_id IS NOT NULL AND vehicle_id IS NOT NULL)
        ),
    CONSTRAINT shipments_pickup_latitude_range
        CHECK (pickup_latitude IS NULL OR pickup_latitude BETWEEN -90 AND 90),
    CONSTRAINT shipments_pickup_longitude_range
        CHECK (pickup_longitude IS NULL OR pickup_longitude BETWEEN -180 AND 180),
    CONSTRAINT shipments_pickup_coordinates_together
        CHECK ((pickup_latitude IS NULL) = (pickup_longitude IS NULL)),
    CONSTRAINT shipments_destination_latitude_range
        CHECK (
            destination_latitude IS NULL
            OR destination_latitude BETWEEN -90 AND 90
        ),
    CONSTRAINT shipments_destination_longitude_range
        CHECK (
            destination_longitude IS NULL
            OR destination_longitude BETWEEN -180 AND 180
        ),
    CONSTRAINT shipments_destination_coordinates_together
        CHECK (
            (destination_latitude IS NULL) = (destination_longitude IS NULL)
        ),
    CONSTRAINT shipments_picked_up_status_has_time
        CHECK (
            status NOT IN ('PICKED_UP', 'IN_TRANSIT', 'DELIVERED')
            OR pickup_time IS NOT NULL
        ),
    CONSTRAINT shipments_delivered_status_has_time
        CHECK (status <> 'DELIVERED' OR delivered_time IS NOT NULL),
    CONSTRAINT shipments_delivered_time_after_pickup
        CHECK (
            delivered_time IS NULL
            OR (pickup_time IS NOT NULL AND delivered_time >= pickup_time)
        )
);

CREATE TABLE IF NOT EXISTS shipment_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id  UUID NOT NULL,
    event_type   TEXT NOT NULL,
    latitude     NUMERIC(9, 6),
    longitude    NUMERIC(9, 6),
    created_by   UUID,
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT shipment_events_shipment_fk
        FOREIGN KEY (shipment_id)
        REFERENCES shipments (id)
        ON DELETE RESTRICT,
    CONSTRAINT shipment_events_created_by_fk
        FOREIGN KEY (created_by)
        REFERENCES users (id)
        ON DELETE SET NULL,
    CONSTRAINT shipment_events_event_type_allowed
        CHECK (
            event_type IN (
                'ASSIGNED',
                'ARRIVED_PICKUP',
                'PICKED_UP',
                'LOCATION_UPDATE',
                'IN_TRANSIT',
                'DELIVERED'
            )
        ),
    CONSTRAINT shipment_events_latitude_range
        CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CONSTRAINT shipment_events_longitude_range
        CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    CONSTRAINT shipment_events_coordinates_together
        CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT shipment_events_location_update_has_coordinates
        CHECK (event_type <> 'LOCATION_UPDATE' OR latitude IS NOT NULL),
    CONSTRAINT shipment_events_metadata_is_object
        CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object'),
    CONSTRAINT shipment_events_metadata_has_no_core_fields
        CHECK (
            metadata IS NULL
            OR NOT (
                metadata ?| ARRAY[
                    'id',
                    'shipment_id',
                    'event_type',
                    'latitude',
                    'longitude',
                    'created_by',
                    'created_at'
                ]
            )
        )
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_created_at
    ON shipment_events (shipment_id, created_at);

CREATE TABLE IF NOT EXISTS transport_offers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id      UUID NOT NULL,
    transporter_id   UUID NOT NULL,
    vehicle_id       UUID NOT NULL,
    offered_price    NUMERIC(14, 2) NOT NULL,
    status           TEXT NOT NULL DEFAULT 'PENDING',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT transport_offers_shipment_fk
        FOREIGN KEY (shipment_id)
        REFERENCES shipments (id)
        ON DELETE RESTRICT,
    CONSTRAINT transport_offers_transporter_fk
        FOREIGN KEY (transporter_id)
        REFERENCES transporter_profiles (user_id)
        ON DELETE RESTRICT,
    CONSTRAINT transport_offers_vehicle_fk
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles (id)
        ON DELETE RESTRICT,
    CONSTRAINT transport_offers_vehicle_transporter_fk
        FOREIGN KEY (vehicle_id, transporter_id)
        REFERENCES vehicles (id, transporter_id)
        ON DELETE RESTRICT,
    CONSTRAINT transport_offers_offered_price_nonnegative
        CHECK (offered_price >= 0),
    CONSTRAINT transport_offers_status_allowed
        CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'))
);

-- A transporter may submit a new offer after a prior offer is rejected or
-- cancelled, but may hold only one active offer for a shipment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_offers_active_transporter
    ON transport_offers (shipment_id, transporter_id)
    WHERE status IN ('PENDING', 'ACCEPTED');

-- PostgreSQL enforces this during concurrent updates, so two offers cannot be
-- accepted for the same shipment even if they are accepted simultaneously.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_offers_one_accepted
    ON transport_offers (shipment_id)
    WHERE status = 'ACCEPTED';

COMMIT;
