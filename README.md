# P.Post Label Generator (SaaS)

Bulk shipping label + money order form generation with background jobs and PDF export.

## Stack
- Frontend: React + Tailwind (Vite)
- Backend: Node.js + Express (TypeScript)
- DB: PostgreSQL (Prisma Migrations)
- PDF: Puppeteer
- Queue: Redis + BullMQ

## Quick start (dev)
1) Start Redis:
   - `docker compose up -d`
2) Configure env:
   - Copy `apps/api/.env.example` to `apps/api/.env` and fill values
   - Copy `apps/web/.env.example` to `apps/web/.env` and fill values
3) Install deps (from repo root):
   - `npm install`
4) DB schema:
   - `npm run prisma:generate -w apps/api`
   - `npm run prisma:migrate -w apps/api`
   - Production start path: `npm run start -w apps/api` (runs `prisma migrate deploy` before API boot)
5) Run API + worker + web (separate terminals):
   - API: `npm run dev -w apps/api`
   - Worker: `npm run worker -w apps/api`
   - Web: `npm run dev -w apps/web`

## Connection Repair
If you see "Failed to reach API endpoint":
1. **Check Port 3000:** Run `netstat -ano | findstr :3000` (Windows) or `lsof -i :3000` (Mac/Linux).
2. **Redis Status:** Run `docker ps` to ensure the Redis container is "Up".
3. **Manual Test:** Open `http://localhost:3000/api/auth/login` in your browser. If you get "Method Not Allowed" or a JSON error, the server is **up**. If you get "Site can't be reached", the server is **down**.
4. **IPv6 Fix:** If the API is running but unreachable, try changing your frontend `.env` from `localhost` to `127.0.0.1`.

## Troubleshooting
- **Redis:** Ensure `docker compose up -d` is running. The API will crash if BullMQ cannot connect to Redis.
- **Port Conflicts:** The API defaults to port 3000. Verify with `netstat` or `lsof` if the port is occupied.
- **DB Errors:** Ensure `npm run prisma:migrate` was successful.
- **Logs:** Check the terminal running `npm run dev -w apps/api` for any red stack traces.

## Production Prisma Workflow
- Deploy with migrations only: `npx prisma migrate deploy && node dist/index.js`
- Ensure database is clean/empty before first deployment.
- Migrations will run on startup and create all required tables.
- **CRITICAL:** Use Railway internal database URL only:
  - Use: `postgresql://[user]:[password]@postgres.railway.internal:5432/[database]`
  - Not external URLs; they cause P3005 errors and migration mismatches.
- Startup logs will display which database host is being connected to for verification.

## Notes
- Upload limit: max 5000 records per file (CSV/XLSX).
- Monthly label limits are enforced by subscription plan.
- PDFs are written locally under `apps/api/storage/outputs` (swap for S3 in production).

## Admin bootstrap
- Set `ADMIN_BOOTSTRAP_SECRET` in `apps/api/.env`
- After registering a user, promote them once (only works if no admins exist yet):
  - `POST /api/admin/bootstrap` with header `x-bootstrap-secret: <ADMIN_BOOTSTRAP_SECRET>` and JSON `{ "email": "you@example.com" }`

# stop everything
CTRL + C

# clean old build
rm -rf dist
rm -rf apps/api/dist

# rebuild
npm run build

# start backend
npm run dev

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