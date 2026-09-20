# Demo payment and wallets

Apply `database/012_demo_wallet.sql` after `011_auth.sql` before starting this
backend. It adds virtual user wallets (zero initial balance), one shared
platform wallet, and append-only wallet events. Each balance is capped at
900,000,000 UZS. Card numbers stay in the browser; they are never sent to this
API or stored. No real funds move.

`GET /wallet`, `POST /wallet/demo-top-up`, and `POST /wallet/demo-cash-out`
operate on the authenticated user's virtual wallet. Top-up and cash-out take a
positive `amount` and a client-generated UUID `operationId`; retrying the same
operation ID is idempotent. Admins can read the shared commission balance at
`GET /admin/platform-wallet`.

`POST /orders/:id/demo-pay` requires a BUYER access token and ownership of the order.
Send an empty JSON object or no body. Supplied amount, fee, status, or buyer fields
are rejected. No real payment provider is called.

New payments are allowed for CONFIRMED, TRANSPORT_PENDING, TRANSPORT_ASSIGNED,
IN_TRANSIT, and DELIVERED orders with positive totals. The order status does not
change. An already committed, internally consistent payment returns the same DTO
on retry, even if the order has since advanced. Refunded/released or inconsistent
financial records produce a conflict; this endpoint never repairs them silently.

The order UUID is the idempotency scope. A transaction locks the owned order,
checks existing financial records, creates or updates one DEMO payment to PAID,
creates or updates CREATED escrow to LOCKED, and appends BUYER_PAYMENT and
ESCROW_FUNDED events. The latter are two audit stages of the same funds, not two
payments. Stable event keys and existing database uniqueness constraints prevent
duplicate entries. Any failure rolls back all writes.

Allocation uses PostgreSQL decimal values from the order: platform fee is
`round(total_amount * 0.003, 2)` added on top of the order total. Escrow gross
is the payable amount; farmer receives subtotal and transporter receives
delivery_fee. The buyer's virtual wallet is debited in the same transaction as
funding. Existing paid zero-fee records remain valid as legacy demo payments.
Amounts in responses are decimal strings to retain precision. This endpoint does not derive
delivery fees from transport offers. Escrow remains locked until a later workflow.
Existing cancellation, refund, and delivery-fee workflows must coordinate with
funded escrow before this demo is used as a real payment system.

Verification from the backend directory:

```powershell
npm.cmd run typecheck
npm.cmd test
node.exe --env-file=.env test/demo-payment.integration.mjs
```

The integration check runs actual HTTP guards, JWT validation, and PostgreSQL
transactions. It creates a randomly named test schema using migrations 002–006
and 012,
including the original FK, CHECK, UNIQUE, and append-only ledger protections.
It checks eight concurrent requests plus retry, ownership, input/state rejection,
FAILED-attempt recovery, and an injected failure after both ledger writes.
The test schema is removed afterward; public application data is untouched.
The database login must be able to create a schema for this test.

## Delivery acceptance and release

`POST /orders/:id/accept-delivery` requires the order's authenticated BUYER and
an empty body. A new acceptance requires DELIVERED and a funded LOCKED/FUNDED
escrow, a matching PAID DEMO payment, and both original funding ledger records.
Allocations come exclusively from escrow. Gross amount matches the order total
plus the fee (or a legacy paid zero-fee record); farmer allocation matches
subtotal and transporter allocation matches delivery_fee.

Under the order, payment, and escrow locks, the transaction sets COMPLETED
(the existing trigger records buyer and history), sets escrow RELEASED with
released_at, and inserts PLATFORM_FEE, FARMER_PAYOUT, and TRANSPORTER_PAYOUT
for positive allocations only. Zero allocations remain visible in the response
but have no ledger entry because the ledger forbids zero amounts. Stable keys
`demo-release:<escrow-id>:<entry-type>` protect each release event.

A retry succeeds only for a consistent COMPLETED/RELEASED result with its exact
payout events and buyer completion-history record. It returns the original release
time. Partial payouts, missing funding, refunds, and inconsistent amounts conflict.
The legacy order action COMPLETE now rejects callers and directs them here.
No real transfers occur, and the payment remains PAID.

The integration command above also checks acceptance HTTP authorization,
eight concurrent release requests, retry equality, all three positive payouts,
zero allocations, FUNDED escrow, partial-payout rejection, the legacy bypass,
and rollback after a payout has been inserted. Its release fixture includes an
explicit nonzero fee to test all event types. The current release transaction
also credits farmer, transporter, and platform virtual wallets exactly once.
