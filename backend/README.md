# Backend foundation — TASK-024

NestJS + TypeScript + node-postgres, using the existing `../database/` schema.
No ORM schema synchronization, table creation, migration execution, or business
endpoints occur at startup. A successful root request returns 404 until routes
are implemented in later tasks.

## Detected environment

- IntelliJ IDEA 2026.1.3 (installed product metadata); no existing .idea or Node project.
- Node.js 24.20.0 and npm 11.19.0.
- PostgreSQL client and installed server binary 18.4; localhost:5432 accepts connections.
- Live server version and database contents could not be queried without a password.
- All ten SQL migrations exist; prior isolated validation recorded 25 tables/71 indexes.

Dependencies are fixed by package-lock.json. Use `npm ci` for reproducible installs.

## Local setup (PowerShell)

Run from backend/:

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env locally and set DB_USER / DB_PASSWORD. Never paste secrets into source.
npm run db:check
npm run start:dev
```

Do not copy over an existing .env. The example uses the installed local postgres
role for development; use a limited application role for deployment. This task
does not change database roles or permissions. Start from backend/ so .env resolves
correctly. Deployment can inject environment variables without a file.

`db:check` is read-only and verifies the current database and server major version.
Startup fails if connection or configuration validation fails. It never recreates
agro_marketplace. The installed client's version alone does not verify the server.
SSL, when enabled, verifies the server certificate; it never disables verification.

## Structure

```text
src/
  app.module.ts
  main.ts
  config/environment.ts
  common/validation.ts
  database/                 # Pool, query/transaction API, connection check
  auth/auth.module.ts
  users/users.module.ts
  listings/listings.module.ts
  orders/orders.module.ts
  logistics/logistics.module.ts
  payments/payments.module.ts
  admin/admin.module.ts
```

Each feature imports DatabaseModule and is otherwise empty. Add repositories,
DTOs and services only when implementing the corresponding future task.
Global ValidationPipe validates decorated DTO classes and rejects unknown fields.
No authentication, payment integration, or authorization behavior is implemented yet.

Always pass SQL values as `$1`, `$2`, etc. through DatabaseService.query(sql, values).
Never interpolate untrusted identifiers or values. Inside transaction(callback),
use only the supplied client; it owns BEGIN/COMMIT/ROLLBACK and row locks. This is
required when later calling reserve_listing_stock(). Do not manually commit or
retain the client beyond the callback. No automatic transaction retries are made.
PostgreSQL NUMERIC remains a string with pg's default parsers: do not convert money
to JavaScript floating-point numbers. SQL timestamps/defaults/constraints remain
authoritative; updated_at must be explicitly maintained where required.

## IntelliJ IDEA

Open the project root to see SQL and backend together. Set the Node interpreter to
the detected `C:\Program Files\nodejs\node.exe`. Create an npm run configuration
using backend/package.json and the start:dev script, with backend/ as working
directory. Machine-specific .idea settings and .env files are ignored by Git.

## Verification

```powershell
npm run typecheck
npm test
npm run build
```

Tests validate configuration failures, DTO validation, transaction commit/rollback
and pool-client release, and Nest startup/shutdown using a fake database pool.
They do not establish connectivity to your real database. Use db:check after
supplying credentials. SIGINT/SIGTERM shutdown closes the database pool.
