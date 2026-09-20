-- Agrologistik Marketplace
-- Query indexes for MVP marketplace, order, logistics, payment, and trust flows.
-- Run after database/001_extensions.sql through database/008_notifications_audit.sql.

BEGIN;

-- Marketplace browse pages show only sellable listings, newest first.
CREATE INDEX IF NOT EXISTS idx_listings_active_created_at
    ON listings (created_at DESC)
    WHERE status = 'ACTIVE' AND available_quantity > 0;

-- Supports active listings for a product; category browsing joins through the
-- existing products(category_id, name) unique index.
CREATE INDEX IF NOT EXISTS idx_listings_active_product_created_at
    ON listings (product_id, created_at DESC)
    WHERE status = 'ACTIVE' AND available_quantity > 0;

-- Farmer dashboards include draft, rejected, sold, and active listings.
CREATE INDEX IF NOT EXISTS idx_listings_farmer_created_at
    ON listings (farmer_id, created_at DESC);

-- Location browse pages filter sellable stock by both administrative levels.
CREATE INDEX IF NOT EXISTS idx_listings_active_region_district_created_at
    ON listings (region, district, created_at DESC)
    WHERE status = 'ACTIVE' AND available_quantity > 0;

CREATE INDEX IF NOT EXISTS idx_orders_buyer_created_at
    ON orders (buyer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_farmer_created_at
    ON orders (farmer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created_at
    ON orders (status, created_at DESC);

-- Unassigned shipments have no transporter and do not belong in transporter queues.
CREATE INDEX IF NOT EXISTS idx_shipments_transporter_created_at
    ON shipments (transporter_id, created_at DESC)
    WHERE transporter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_status_created_at
    ON shipments (status, created_at DESC);

-- Existing offer uniqueness indexes cover active/accepted subsets only; this
-- full timeline index also serves rejected and cancelled offer history.
CREATE INDEX IF NOT EXISTS idx_transport_offers_shipment_created_at
    ON transport_offers (shipment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_order_created_at
    ON payments (order_id, created_at DESC);

-- The reviews unique key starts with order_id, so only user-centric directions
-- need separate indexes.
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_created_at
    ON reviews (reviewer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewed_user_created_at
    ON reviews (reviewed_user_id, created_at DESC);

-- The leading order_id supports all disputes for an order; status narrows it.
CREATE INDEX IF NOT EXISTS idx_disputes_order_status_created_at
    ON disputes (order_id, status, created_at DESC);

-- Manual review queues primarily contain unresolved disputes.
CREATE INDEX IF NOT EXISTS idx_disputes_active_status_created_at
    ON disputes (status, created_at DESC)
    WHERE status IN ('OPEN', 'UNDER_REVIEW');

COMMIT;
