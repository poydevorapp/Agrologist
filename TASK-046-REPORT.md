# TASK-046 — Failure states and demo hardening

## Issues found, root causes, and fixes

| Reproduced issue | Root cause | Isolated fix |
| --- | --- | --- |
| New listings could not be moderated | Creation inherited the database's DRAFT default, but moderation only accepts PENDING and there is no submit endpoint | API creates PENDING listings; saving an existing DRAFT/REJECTED listing submits it for moderation |
| Price-only edits erased map coordinates and descriptions | Transformed DTO instances own omitted optional properties with undefined values | PATCH distinguishes omitted values from explicit null; empty PATCH returns 400 |
| Whitespace listing text returned 500 | Input passed length validation, then failed the database's nonblank constraint after trimming | Reject blank trimmed listing fields with 400 |
| Transport discovery had no shipment for a requested order | REQUEST_TRANSPORT only updated orders.status | Create the PENDING shipment in the same transaction using the existing order uniqueness constraint |
| Transporter payout was missing | Acceptance ignored offered_price when setting the order's delivery fee and total | Snapshot the accepted fee and recompute total in PostgreSQL before payment; reject price changes when financial records already exist |
| Generic lifecycle actions bypassed shipment assignment/events | Legacy order actions could update synchronized statuses independently | Require offer acceptance and shipment actions for transport transitions |
| Cancelling a paid order stranded funded escrow | Cancellation restored stock without inspecting financial state | Reject funded cancellation until a refund workflow exists |
| UI allowed payment before the final delivery price | availableActions marked CONFIRMED/TRANSPORT_PENDING orders payable | Enable the UI payment action after transport assignment; retain the existing payment endpoint contract |
| Malformed JSON caused null data/loading or render failures | Successful responses were blindly cast to DTOs | Reject invalid/null response bodies and provide a localized route error boundary |
| Temporary refresh outages logged users out | Every non-2xx refresh response cleared session storage | Only authentication rejection clears credentials; transient errors propagate for retry |
| Corrupt session data could crash the app shell | Stored JSON was trusted without validating token/user fields | Validate stored/auth response data and synchronize session changes with the auth provider |
| Failed logout produced an unhandled UI rejection | Sign-out handler did not catch the request failure | Clear local session, return to login, and display an error if server revocation failed |
| External map/API requests could leave loading indefinitely | No request timeout; route coordinates were trusted | Add bounded requests, validate route points, retain approximate-route fallback, and show tile failure/retry state |

No application database migrations or public application data were changed. Temporary test schemas and their contents were removed; rerunning the integration test recreates them.

## Files changed

Backend:

- backend/src/listings/listings.service.ts
- backend/src/orders/order-lifecycle.service.ts
- backend/src/orders/orders.service.ts
- backend/src/logistics/shipment-lifecycle.service.ts
- backend/test/foundation.test.mjs
- backend/test/demo-hardening.integration.mjs (new)

Frontend:

- frontend/lib/api.ts
- frontend/lib/session-store.ts
- frontend/components/auth-provider.tsx
- frontend/components/app-shell.tsx
- frontend/components/maps/shipment-map.tsx
- frontend/app/api/backend/[...path]/route.ts
- frontend/app/error.tsx (new)
- frontend/package.json
- frontend/test/failure-states.test.mjs (new)

Report:

- TASK-046-REPORT.md (new)

## Test and build results

- Backend typecheck and production build: passed.
- Existing backend tests: 37/37 passed; no tests removed.
- PostgreSQL integration smoke checks: 133 passed, zero failures, using a disposable schema on local PostgreSQL 18.4.
- Existing payment integration script: passed, including eight concurrent payment requests, eight concurrent releases, retries, and injected rollback failures.
- Frontend typecheck and production build: passed.
- Frontend failure-state tests: 7/7 passed.
- Production startup: verified backend in NODE_ENV=production on a temporary port; frontend production server on port 3001.
- Backend and frontend proxy health: HTTP 200, database up. Login HTML and all 11 referenced production assets returned 200.
- Unavailable backend: proxy HTTP 502 and browser login error; submit button recovers.
- Unavailable database: injected test-pool failure returns structured health HTTP 503; the real PostgreSQL server was not stopped.
- JWT/role/UUID/missing-resource/ownership/input checks, insufficient stock, duplicate offers, invalid status actions, and concurrent acceptance: passed.
- Two distinct buyers requesting the final stock concurrently: one order succeeds, one conflicts, stock stays zero.
- Browser smoke checks: login/logout, wrong-role retry state, farmer order visibility, admin summary, buyer escrow/tracking map, transporter tracking map and disabled completed actions.
- All five locale selections changed UI text; Russian persisted across navigation and browser restart. Existing English fallback text remains.

Commands, from the relevant project subdirectory:

```powershell
# backend
npm.cmd run typecheck
npm.cmd test
node --env-file=.env test/demo-hardening.integration.mjs
node --env-file=.env test/demo-payment.integration.mjs

# frontend
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

The smoke integration runner uses local DB_* credentials and a unique schema; it intentionally does not target a hosted DATABASE_URL. Browser fixture mode is optional (`DEMO_BROWSER=true`) and has a 10-minute cleanup deadline. It is test tooling, not an application endpoint.

## Main demo flow result

The real HTTP API + PostgreSQL flow passes: farmer creates/edits a listing, admin approves, buyer browses and orders, farmer confirms/requests transport, transporter offers, farmer accepts, buyer demo-pays, transporter picks up/transits/delivers, buyer accepts delivery, and admin reads the resulting records. The final order is COMPLETED, escrow is RELEASED, and the accepted transporter fee is paid exactly once in the demo ledger.

The browser-only flow is not complete. The existing farmer order page has no confirmation or transport-request controls, and there is no offer-acceptance UI. These are missing product controls, not failures in the APIs. They were not added under this task's no-new-features constraint.

## Remaining known issues and deployment readiness

- The public database currently has zero role-assigned users with local login credentials in each of FARMER, BUYER, TRANSPORTER, and ADMIN. Registration does not assign roles or provision role profiles. Usable demo accounts must be provisioned deliberately; this test did not grant roles to public users.
- A full self-service browser demo needs the missing farmer lifecycle and offer-acceptance controls described above.
- Some user-facing labels still use the existing English fallback. Full translation coverage was outside this task.
- Orders already paid before fee agreement cannot accept a different transport fee or be cancelled without refund handling. Those actions now fail safely; no refund feature was added.
- Public deployment and hosted database connectivity were not performed; production credentials, hosts, and deployment configuration still require verification on the selected hosting providers.
- TASK-047–050 security, database, full E2E, and final audits were not performed.

READY FOR DEMO DEPLOYMENT: NO for an unattended, end-to-end public UI demo. The tested API flow and production builds pass, but missing demo accounts and UI workflow controls remain deployment-readiness blockers.
