# P.Post Label Generator (SaaS)

Bulk shipping label + money order form generation with background jobs and PDF export.

## Stack
- Frontend: React + Tailwind (Vite)
- Backend: Node.js + Express (TypeScript)
- DB: PostgreSQL (Prisma Migrations)
- PDF: Puppeteer
- Queue: Redis + BullMQ

## Quick start (dev)

### Automated Bootstrap (Recommended)
If you have Docker installed, run:
```bash
npm run s0:bootstrap
```

This runs the complete bootstrap sequence:
1. Starts PostgreSQL and Redis containers
2. Fixes placeholder REDIS_URL in .env
3. Generates Prisma client
4. Runs database migrations
5. Verifies S0 prerequisites

Then start the services:
```bash
npm run dev:api      # Terminal 1: API server
npm run worker:dev   # Terminal 2: Worker process
npm run dev:web      # Terminal 3: Web frontend
```

### Manual Bootstrap (Step-by-Step)
If automated bootstrap fails, or Docker is not available, follow these steps:

**1) Start Infrastructure:**
```bash
# If Docker is available:
npm run infra:up                          # Starts PostgreSQL and Redis
npm run infra:status                      # Check if containers are running

# If Docker is NOT available:
# - Start PostgreSQL on localhost:5432 manually
# - Start Redis on localhost:6379 manually
```

**2) Configure Environment:**
```bash
# Copy example env file (if not already done)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Fix placeholder REDIS_URL in apps/api/.env:
# From: REDIS_URL=redis://default:PASSWORD@HOST:PORT
# To:   REDIS_URL=redis://localhost:6379

# Or use automation:
npm run infra:fix
```

**3) Install Dependencies:**
```bash
npm install
```

**4) Initialize Database:**
```bash
npm run prisma:generate --workspace=@labelgen/api
npm run prisma:migrate --workspace=@labelgen/api
```

**5) Verify Prerequisites:**
```bash
npm run s0:prereq
# Should report: ✅ S0 PREREQUISITES MET
```

**6) Start Services (separate terminals):**
```bash
npm run dev:api      # Terminal 1: API server (port 3000)
npm run worker:dev   # Terminal 2: Worker process
npm run dev:web      # Terminal 3: Web frontend (port 5173)
```

### Infrastructure Helper Scripts
```bash
npm run infra:check      # Test PostgreSQL and Redis connectivity
npm run infra:fix        # Replace placeholder REDIS_URL with localhost:6379
npm run infra:up         # Start Docker containers (docker compose up -d)
npm run infra:down       # Stop Docker containers (docker compose down)
npm run infra:status     # Show container status (docker compose ps)
npm run infra:verify     # Check connectivity and generate Prisma client
npm run s0:prereq        # Verify S0 prerequisites before baseline validation
npm run s0:bootstrap     # Complete automated bootstrap (Docker required)
```

## Connection Repair & Infrastructure Troubleshooting

### API Not Reachable
If you see "Failed to reach API endpoint":
1. **Check Port 3000:** Run `netstat -ano | findstr :3000` (Windows) or `lsof -i :3000` (Mac/Linux).
2. **Redis Status:** Run `docker ps` to ensure the Redis container is "Up" (or use `npm run infra:status`).
3. **Manual Test:** Open `http://localhost:3000/api/auth/login` in your browser. If you get "Method Not Allowed" or a JSON error, the server is **up**. If you get "Site can't be reached", the server is **down**.
4. **IPv6 Fix:** If the API is running but unreachable, try changing your frontend `.env` from `localhost` to `127.0.0.1`.

### PostgreSQL Issues
```bash
# Test connectivity:
npm run infra:check

# Verify database:
# - Ensure DATABASE_URL in apps/api/.env is set correctly
# - Default: postgresql://labelgen:labelgen@localhost:5432/labelgen
# - On Windows, verify with: Test-NetConnection -ComputerName localhost -Port 5432

# Restart database:
npm run infra:down && npm run infra:up && sleep 5

# Re-run migrations:
npm run prisma:migrate --workspace=@labelgen/api
```

### Redis Issues
```bash
# Test connectivity:
npm run infra:check

# Fix placeholder REDIS_URL:
npm run infra:fix

# Expected REDIS_URL after fix: redis://localhost:6379

# Verify Redis is running:
npm run infra:status

# Restart Redis:
npm run infra:down && npm run infra:up && sleep 3
```

### Worker Not Starting
1. Check if API is running (`npm run dev:api`).
2. Verify startup logs for readiness state: should show `FULLY_READY`, not `DEGRADED_*`.
3. Run `npm run s0:prereq` to diagnose missing dependencies.
4. If `DEGRADED_NO_DB` or `DEGRADED_NO_REDIS`: fix infrastructure first (see above).

### Build or Migration Errors
```bash
# Clean rebuild:
npm run build

# Regenerate Prisma client:
npm run prisma:generate --workspace=@labelgen/api

# Re-run migrations:
npm run prisma:migrate --workspace=@labelgen/api
```

## Troubleshooting Summary
- **Can't reach API:** Check port 3000 and verify API is running with `npm run dev:api`
- **Worker won't start:** Run `npm run s0:prereq` and fix any failed checks
- **DB connection refused:** Run `npm run infra:check` and follow remediation guidance
- **Redis placeholder error:** Run `npm run infra:fix` to auto-correct REDIS_URL
- **Migrations fail:** Ensure PostgreSQL is running and accessible, then retry `npm run prisma:migrate --workspace=@labelgen/api`

## Startup Readiness States
- `FULLY_READY`: PostgreSQL and Redis are both reachable. API initialization, queue recovery, and worker startup can proceed normally.
- `DEGRADED_NO_DB`: PostgreSQL is unavailable. The API can still bind, but database-backed routes and worker job execution are blocked.
- `DEGRADED_NO_REDIS`: Redis is unavailable. The API can still bind, but queue recovery and worker queue consumption are blocked.
- `DEGRADED_NO_DB_OR_REDIS`: Both dependencies are unavailable. Treat this as a bootstrap failure and fix infrastructure before moving past baseline validation.

## Local Bootstrap Checklist
1. Start local infrastructure with `docker compose up -d`.
2. Confirm PostgreSQL is reachable with `Test-NetConnection -ComputerName localhost -Port 5432`.
3. Replace placeholder values in `apps/api/.env`, especially `REDIS_URL`.
4. Run `npm run prisma:generate --workspace=@labelgen/api` and `npm run prisma:migrate --workspace=@labelgen/api`.
5. Start API and worker, then confirm the startup logs report `FULLY_READY` before running storage rollout staging checks.

## Production Prisma Workflow
- Deploy with migrations only: `npx prisma migrate deploy && node dist/index.js`
- Ensure database is clean/empty before first deployment.
- Migrations will run on startup and create all required tables.
- **CRITICAL:** Use Railway internal database URL only:
  - Use: `postgresql://[user]:[password]@postgres.railway.internal:5432/[database]`
  - Not external URLs; they cause P3005 errors and migration mismatches.
- Startup logs will display which database host is being connected to for verification.

## Complaint Flow (Pakistan Post ep.gov.pk)
Pakistan Post complaints are filed against PENDING shipments via automated ASP.NET form submission.

### Architecture
```
BulkTracking.tsx  →  POST /api/tracking/complaint  →  Python /submit-complaint  →  ep.gov.pk
```

### Complaint Lifecycle
1. User opens complaint modal from PENDING shipment row
2. Addressee name/address/city wait for complaint prefill and then map from API response with tracking-data fallback
3. District/Tehsil/Delivery Office hierarchy is auto-matched from delivery office CSV
4. On submit, Node API validates all required fields (rejects "-" as empty and blocks missing addressee name)
4. Python service fills ASP.NET form with DDDistrict → DDTehsil → DDLocations postback chain
5. Complaint ID (CMP-XXXXXX) and Due Date are parsed from response
6. Stored in `shipment.complaintText` as `COMPLAINT_ID: xxx | DUE_DATE: dd-mm-yyyy | COMPLAINT_STATE: ACTIVE`
7. Row replaces the complaint button with a green complaint status card showing Complaint ID, Due Date, and current status

### Admin Complaint Operations
- Export CSV: `GET /api/admin/complaints/export`
- Manual sync: `POST /api/admin/complaints/sync`
- SLA alerts feed: `GET /api/admin/complaints/alerts`
- Audit log feed: `GET /api/admin/complaint-audit`
- Manual backup: `POST /api/admin/complaints/backup`

### Complaint Sync And Alerts
- Complaint sync runs every 6 hours and derives `OPEN`, `IN_PROCESS`, `RESOLVED`, `CLOSED` from the latest Pakistan Post tracking state plus complaint due date
- SLA alerts are logged at due date minus 2 days, minus 1 day, and on the due date
- Complaint backup runs every 12 hours and keeps the latest 30 complaint, label, and money-order snapshots

### Retry & Timeout Hardening
- Timeout: 90 seconds per HTTP request to ep.gov.pk
- Retries: 3 attempts with backoff 2s / 4s / 8s
- Retryable errors: `ConnectionReset`, `ReadTimeout`, `ConnectionError`, `ProtocolError`

### Duplicate Detection
- If same tracking already has `complaintStatus = "FILED"` with a future due date, API returns 409
- Frontend shows "Complaint already active" alert with existing ID/due date

### Counters
- Today's complaint count and monthly total are visible in the complaint modal header
- Sourced from `usage_logs` table, exposed via `/api/me` balances

### Docs
 - [docs/operations/local-bootstrap.md](docs/operations/local-bootstrap.md) — Complete local PostgreSQL + Redis bootstrap guide for development and S0 validation
 - [docs/architecture/storage-rollout-architecture.md](docs/architecture/storage-rollout-architecture.md) — Final storage/rollout architecture (API/worker, dual-write/read, streaming fallback)
 - [docs/rollout/storage-rollout-runbook.md](docs/rollout/storage-rollout-runbook.md) — Staging/canary rollout, startup readiness states, rollback, outage, degraded mode, memory and cleanup runbook
 - [docs/architecture/complaints.md](docs/architecture/complaints.md) — Full complaint lifecycle and duplicate handling
 - [docs/architecture/system-map.md](docs/architecture/system-map.md) — Module dependency map
- [docs/architecture/package-usage.md](docs/architecture/package-usage.md) — Complaint quota tracking
- [docs/operations/help-complaint-recovery.md](docs/operations/help-complaint-recovery.md) — Recovery procedures
- [docs/operations/help-complaint-timeouts.md](docs/operations/help-complaint-timeouts.md) — Timeout troubleshooting


- Upload limit: max 5000 records per file (CSV/XLSX).
- Monthly label limits are enforced by subscription plan.
- PDFs are written locally under `apps/api/storage/outputs` (swap for S3 in production).

## Admin bootstrap
- Set `ADMIN_BOOTSTRAP_SECRET` in `apps/api/.env`
- After registering a user, promote them once (only works if no admins exist yet):
  - `POST /api/admin/bootstrap` with header `x-bootstrap-secret: <ADMIN_BOOTSTRAP_SECRET>` and JSON `{ "email": "you@example.com" }`

## Admin Command Center
- Main admin route: `/admin`
- Legacy admin route: `/admin/legacy`
- `/admin` is guarded by admin auth (`RequireAdmin`); non-admin users are redirected away.
- Legacy stable operations are restored inside command-center tabs (users/plans/usage/shipments/payments/invoices/settings) using embedded legacy operations panel.

New additive command-center API endpoints:
- `GET /api/admin/dashboard/summary`
- `GET /api/admin/dashboard/jobs`
- `GET /api/admin/dashboard/revenue`
- `GET /api/admin/dashboard/usage`
- `GET /api/admin/dashboard/users`
- `GET /api/admin/dashboard/health`
- `GET /api/admin/storage`
- `GET /api/admin/audit`

Safe admin mutation and compatibility endpoints:
- `POST /api/admin/users`
- `PATCH /api/admin/plans/:planId`
- `PATCH /api/admin/payments/:paymentId/status`
- `PATCH /api/admin/jobs/:jobId/status`
- `POST /api/admin/jobs/:jobId/retry`
- `POST /api/admin/complaints/:trackingId/sync`
- `PATCH /api/admin/invoices/:invoiceId`
- `DELETE /api/admin/invoices/:invoiceId`
- `POST /api/admin/users/:userId/units`
- `POST /api/admin/users/:userId/reactivate`
- `POST /api/admin/payments/:id/approve`
- `POST /api/admin/payments/:id/reject`

List query support for admin tables:
- `search`, `from`, `to`, `status`, `page`, `pageSize`, `sortBy`, `sortOrder`

# stop everything
CTRL + C

# clean old build
rm -rf dist
rm -rf apps/api/dist

# rebuild
npm run build

## Verified Phase 4 Canary Result

The live S1 canary completed successfully with authenticated multipart upload, local PDF generation, async R2 dual-write, and rollback validation.

Authoritative record: [docs/PHASE-4-LIVE-CANARY-FINAL-REPORT.md](docs/PHASE-4-LIVE-CANARY-FINAL-REPORT.md)

# start backend
npm --workspace=@labelgen/api run dev

# start worker
npm run worker

---

## Label Types

All labels follow a unified MO-structured layout with six standardised blocks:
**Header → Barcode → Primary → Amount → Address → Footer**

### 1. Envelope Label (`label-envelope.html`)
- Print size: 9 × 4 inch (landscape), one label per page
- Rendered by `envelopeHtml()` in `labels.ts`
- MO structured layout (horizontal)
- Large barcode, minimal borders

### 2. Box Label — 4 per A4 (`label-box-a4.html`)
- Print size: 104mm × 147mm (≈ 4.1 × 5.8 inch), 2 × 2 grid on A4
- Rendered by `labelsHtml()` in `labels.ts`
- Full MO structured blocks, 0.95× scaled inner core

### 3. Flyer Label — 8 per A4 (`label-flyer-a4.html`)
- Print size: 105mm × 74.25mm, 2 × 4 grid on A4
- Rendered by `flyerHtml()` in `labels.ts`
- Compact MO layout — smaller fonts, all blocks retained

---

## Amount Display Rules

| Shipment Type | Gross Amount | MO Commission | Net Amount |
|---------------|:------------:|:-------------:|:----------:|
| VPL / VPP     | ✔            | ✔ (separate)  | ✔          |
| COD           | ✔            | ✔ (separate)  | ✔          |
| RGL / PAR     | —            | —             | —          |

- **Net Amount** = Gross Amount − MO Commission (calculated by existing `moneyOrderBreakdown()`)
- Commission is always shown as a separate line — never hidden
- When an order exceeds Rs. 20,000 the breakdown splits into multiple MO blocks automatically

---

## MO Structured Label Blocks

| # | Block    | Contents                                        |
|---|----------|-------------------------------------------------|
| ① | Header   | Carrier name · Prefix badge (type + amount)     |
| ② | Barcode  | Code-128 barcode image · Tracking ID (mono)     |
| ③ | Primary  | Tracking ID · Order/Ref ID · Booking Date       |
| ④ | Amount   | Gross / Commission / Net (or Gross-only for COD)|
| ⑤ | Address  | TO (receiver, bold) · FROM (sender)             |
| ⑥ | Footer   | Weight · Product description · System branding  |

---

## System Rule

- **No business logic was changed** — templates are presentation-layer only
- All amount calculations remain inside existing `moneyOrderBreakdown()` function
- No new formulas or recalculations introduced