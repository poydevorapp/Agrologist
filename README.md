# Agrologistik Marketplace — PostgreSQL foundation

This repository contains the PostgreSQL schema and a NestJS backend foundation
for Agrologistik Marketplace. The database name is `agro_marketplace`.

Backend setup, environment requirements, IntelliJ instructions, and test commands
are documented in `backend/README.md`. The backend uses the existing SQL schema
without automatic schema synchronization or migration execution.

The numbered migrations from `database/001_extensions.sql` through
`database/012_demo_wallet.sql` are implemented. Apply them in order; the backend
does not run migrations automatically. `012_demo_wallet.sql` adds demo-only
wallets and a shared admin commission account without changing older scripts.

## Prerequisites

- PostgreSQL with the `psql` command-line client available
- A PostgreSQL role allowed to create databases and extensions

The examples below use the `postgres` administrative role. Change `-U postgres`
if your PostgreSQL installation uses a different role.

## Create the database

Run this command from a terminal:

```sh
psql -U postgres -d postgres -c "CREATE DATABASE agro_marketplace;"
```

Database creation is a one-time operation. If the database already exists,
PostgreSQL will report that instead of replacing it.

## Connect to the database

```sh
psql -U postgres -d agro_marketplace
```

To leave the interactive `psql` session, run `\q`.

## Install the required extension

From the repository root, run:

```sh
psql -U postgres -d agro_marketplace -v ON_ERROR_STOP=1 -f database/001_extensions.sql
```

The migration uses `CREATE EXTENSION IF NOT EXISTS`, so it is safe to rerun.
Only `pgcrypto` is enabled; it provides UUID generation through
`gen_random_uuid()` without adding unnecessary extensions.

## Verify the installation

Confirm that `pgcrypto` is installed:

```sh
psql -U postgres -d agro_marketplace -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'pgcrypto';"
```

Confirm that UUID generation works:

```sh
psql -U postgres -d agro_marketplace -c "SELECT gen_random_uuid() AS generated_uuid;"
```

The first command should return one row named `pgcrypto`; the second should
return a UUID value.

## Transaction-safe order creation

`reserve_listing_stock(listing_id, quantity)` locks the selected listing row
with `SELECT ... FOR UPDATE`. A competing transaction requesting the same
listing waits for the lock, then reads the newly committed quantity before it
can reserve stock. The function rejects inactive listings, nonpositive
quantities, and requests larger than the remaining stock. The existing
`listings_available_quantity_nonnegative` constraint is a final database-level
safeguard.

The stock reservation, order insert, and item insert must be one transaction.
This SQL Shell example creates a single-item order; replace the three input
values first:

```sql
\set ON_ERROR_STOP on
\set buyer_id '00000000-0000-0000-0000-000000000000'
\set listing_id '00000000-0000-0000-0000-000000000000'
\set requested_quantity 10.00

BEGIN;

SELECT *
FROM reserve_listing_stock(
    :'listing_id'::UUID,
    :'requested_quantity'::NUMERIC
) \gset stock_

SELECT round(
    :'stock_reserved_quantity'::NUMERIC
    * :'stock_unit_price'::NUMERIC,
    2
) AS line_total
\gset

INSERT INTO orders (
    buyer_id,
    farmer_id,
    status,
    subtotal,
    delivery_fee,
    total_amount
)
VALUES (
    :'buyer_id'::UUID,
    :'stock_farmer_id'::UUID,
    'PENDING',
    :'line_total'::NUMERIC,
    0,
    :'line_total'::NUMERIC
)
RETURNING id AS order_id
\gset

INSERT INTO order_items (
    order_id,
    listing_id,
    quantity,
    unit_price,
    line_total
)
VALUES (
    :'order_id'::UUID,
    :'listing_id'::UUID,
    :'stock_reserved_quantity'::NUMERIC,
    :'stock_unit_price'::NUMERIC,
    :'line_total'::NUMERIC
);

COMMIT;
```

If any statement fails, execute `ROLLBACK`; the stock decrement is rolled back
with the order. For a multi-item order, reserve listings in ascending listing ID
order inside one transaction to avoid deadlocks, verify they belong to the same
farmer, then insert the order and all items before committing.

## Recording order status changes

The `trg_orders_status_history` trigger records the initial status and every
distinct change to `orders.status`. When actor and note context are available,
provide them as transaction-local settings before the update:

```sql
BEGIN;

SET LOCAL app.changed_by = '00000000-0000-0000-0000-000000000000';
SET LOCAL app.status_note = 'Order confirmed by buyer';

UPDATE orders
SET status = 'CONFIRMED',
    updated_at = CURRENT_TIMESTAMP
WHERE id = '00000000-0000-0000-0000-000000000000';

COMMIT;
```

If these settings are omitted, the history record is still created with null
`changed_by` and `note` values.

## Demo financial ledger (TASK-016)

Rerun `database/006_payments.sql` to install `financial_ledger`. Each row records
one positive financial event. `payment_id` and `escrow_id`, when supplied, must
belong to the same `order_id`. Buyer receipts require a payment; escrow funding,
fees and payouts require an escrow; refunds require at least one source.
Zero allocations have no ledger entry. Amounts use exact two-decimal NUMERIC.

Every insert must supply a globally unique, stable `event_key`, for example
`demo:payment:<payment-uuid>:received` or `demo:refund:<refund-operation-uuid>`.
Reuse that key on retries. The unique constraint serializes conflicting inserts;
after a duplicate-key error, compare the stored source, type and amount with the
retry rather than assuming an unrelated payload succeeded. A separate unique
index permits only one BUYER_PAYMENT entry per payment, even with different keys.
Other types allow multiple legitimate installments with different event keys.

Write the payment/escrow state change and its ledger insert in one transaction.
Lock the corresponding payment/escrow row with SELECT ... FOR UPDATE before
checking remaining refundable or payable amounts. Roll back both on any error.
There are no automatic ledger entries or external payment calls in this migration.

The ALWAYS statement trigger rejects UPDATE, DELETE and TRUNCATE, including
attempts to change metadata. PUBLIC mutation privileges are revoked. Use a
non-owner application role with only SELECT/INSERT ledger privileges in production;
owners and superusers can still disable/drop database protections. Corrections
must be new, explicitly identified compensating events, never edits to old rows.
This event log is not yet a double-entry accounting system.

Metadata accepts only objects for optional context. Known core column names are
rejected at the top level; callers must not hide relational or monetary data under
other keys or nested objects. The check is not a semantic JSON validator.

Consistency review: escrow allocations already balance to gross_amount, and order
deletion is restricted. This migration also rejects NUMERIC NaN in existing payment
and escrow amounts, and adds composite source/order indexes for ledger foreign keys.
Existing invalid NaN rows make the migration fail atomically for explicit review;
the migration does not rewrite financial data.

Remaining workflow constraints: payment totals, escrow gross_amount and order totals
are not reconciled automatically; cumulative funding, payouts and refunds are not
capped by this table. Status transitions and amounts on payment/escrow rows remain
mutable, and updated_at is not automatically maintained. The caller must perform
validated state changes and ledger writes atomically. Non-DEMO payments currently
require a provider transaction ID even while pending; revisit that rule when a real
provider's initiation flow is implemented. No existing history is fabricated or
backfilled. The single currency is implicit; explicit currency support is needed
before supporting multiple currencies.

## Migration order

Numbered scripts are intended to be run in ascending order. Do not run the
placeholder scripts as schema migrations until their corresponding tasks have
been implemented.
