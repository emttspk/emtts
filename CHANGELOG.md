# Changelog

## 2026-05-29 - Admin Legacy Function Restore in Command Center

### Scope
Restored lost legacy admin operations into `/admin` command center while keeping protected scope intact.

### UI Restore
- Reconnected stable legacy operational panels for users/plans/usage/shipments/payments/invoices/settings inside new command center tabs.
- Restored account management actions (add/edit/suspend/reactivate/delete, manual units, plan assignment).
- Restored invoice management actions (download, status update, void, guarded delete).
- Restored exempt file option in billing settings panel.
- Restored Money Order Designer access link in command center dashboard.

### API Restore/Compatibility
- Added `POST /api/admin/users`
- Added `PATCH /api/admin/invoices/:invoiceId`
- Added `DELETE /api/admin/invoices/:invoiceId`
- Added `POST /api/admin/users/:userId/units`
- Added `POST /api/admin/users/:userId/reactivate`
- Added compatibility aliases:
  - `POST /api/admin/payments/:id/approve`
  - `POST /api/admin/payments/:id/reject`

### Safety
- Guarded invoice deletion to unpaid/non-approved-payment records only.
- No changes to protected rendering/tracking/complaint core engines.

## 2026-05-29 - SaaS Admin Command Dashboard Cleanup and Controls

### Scope
Completed full admin command-center control cycle with pending-file cleanup safety and tab-level operational controls.

### Pending Cleanup
- Executed required git inspection commands and classified pending files.
- Preserved unrelated user data by avoiding destructive cleanup.
- Added ignore coverage for local unrelated folder: `jazz cash/`.

### Admin UI
- Upgraded `apps/web/src/pages/admin/AdminCommandCenter.tsx` from scaffold to functional tab operations.
- Added common controls across applicable tabs:
  - search, date range, quick date filters, status input, refresh, pagination, clear filters.
- Added safe row actions across tabs (edit/suspend, approve/reject, cancel/archive, sync/export/download where applicable).
- Confirmed `/admin` remains protected under admin guard and `/admin/legacy` remains protected.

### Admin API
- Added compatibility/safe mutation endpoints:
  - `PATCH /api/admin/plans/:planId`
  - `PATCH /api/admin/payments/:paymentId/status`
  - `PATCH /api/admin/jobs/:jobId/status`
  - `POST /api/admin/jobs/:jobId/retry`
  - `POST /api/admin/complaints/:trackingId/sync`
- Added/expanded list query support (`search`, `from`, `to`, `status`, `page`, `pageSize`, `sortBy`, `sortOrder`) on:
  - `GET /api/admin/usage`
  - `GET /api/admin/jobs`
  - `GET /api/admin/shipments`
  - `GET /api/admin/invoices`

### Protected Scope Compliance
- No changes to protected label rendering, money-order amount logic, barcode engine, finalized tracking upload logic, or finalized complaint engine internals.

## 2026-05-29 - SaaS Admin Command Dashboard Phase 1

### Scope
Implemented additive admin command dashboard APIs and a new command-center UI shell.

### Backend
- Added new aggregate endpoints in `apps/api/src/routes/admin.ts`:
  - `GET /api/admin/dashboard/summary`
  - `GET /api/admin/dashboard/jobs`
  - `GET /api/admin/dashboard/revenue`
  - `GET /api/admin/dashboard/usage`
  - `GET /api/admin/dashboard/users`
  - `GET /api/admin/dashboard/health`
  - `GET /api/admin/storage`
  - `GET /api/admin/audit`
- Added aggregate helpers for UTC period windows, revenue totals, usage totals, and platform health snapshot.

### Frontend
- Added `apps/web/src/pages/admin/AdminCommandCenter.tsx` for modular command-center navigation.
- Added `apps/web/src/components/admin/AdminWidgets.tsx` (metric cards and status pills).
- Updated route wiring in `apps/web/src/App.tsx`:
  - `/admin` now serves the new command center.
  - Legacy admin remains available at `/admin/legacy`.

### Protected Scope Compliance
- No changes to label renderer internals, money-order renderer internals, MOS logic, or protected tracking/complaint business rules.

## 2026-05-24 - Live Railway Upload Verification PASS

### Scope
Final live production verification for upload stuck-at-Uploading issue after commit `49e6c3f`.

### Deployment Status
- API deployment: `a8453673-770e-4a03-ba2b-90774b0060a8` -> `SUCCESS`
- Worker deployment: `456da23d-5b3d-42f1-b07e-3855fe7ce082` -> `SUCCESS`

### Migration Evidence
- Railway API deployment logs confirm migration applied:
  - `Applying migration 20260524041000_add_tracking_master_synced_at`
  - `All migrations have been successfully applied.`
  - Subsequent startup: `14 migrations found` and `No pending migrations to apply.`

### Live Runtime Verification
- `curl https://api.epost.pk/health` -> `200` with `{"status":"ok"}`
- `curl https://api.epost.pk/health/worker` -> `200` (worker healthy)
- Real upload path with same source filename evidence in live API logs:
  - `POST /api/upload`
  - `SOURCE_FILENAME_RECEIVED ... lcs 17-13-11-2024.xls`
  - `Job added (filePath+fileBuffer dual-mode): 04729f8d-694c-4e23-8516-b75eb62d0a85`
- LabelJob creation and polling/download flow observed:
  - `GET /api/jobs/04729f8d-694c-4e23-8516-b75eb62d0a85`
  - `GET /api/jobs/04729f8d-694c-4e23-8516-b75eb62d0a85/download/labels`
- Worker picked and processed the same job from BullMQ/Redis:
  - `[Worker] Processing job 04729f8d-694c-4e23-8516-b75eb62d0a85`
  - `[Worker] Parsing success ... Rows: 10`
  - `[Worker] Labels output file path: /app/storage/generated/04729f8d-694c-4e23-8516-b75eb62d0a85-labels.pdf`

### Error Clearance
- Previous Prisma runtime error is cleared in latest deployment/runtime window:
  - No `P2022` for `LabelJob.trackingMasterSyncedAt` present in latest API logs after migration.

### Result
- Upload no longer remains stuck at `Uploading` for the verified live flow.
- Backend returns successful JSON path and downstream job processing completes.

## 2026-05-24 - Retention Cleanup Final Verification PASS

### Scope
Final backend retention cleanup verification under Protected Scope Protocol.

### Final Verification Result
- `npm run build` -> PASS
- `npm run strict-runtime-verify` -> PASS
- Latest retention forensic evidence -> PASS
  - `forensic-artifacts/retention-cleanup-verify-2026-05-23T22-07-20-559Z.json`
  - `pass: true`
  - `dbRemaining: []`
  - `trackingRemaining: []`
  - `localRemaining: []`
  - `r2Enabled: true`
  - `r2Verified: true`

### Notes
- Strict runtime evidence generated:
  - `forensic-artifacts/strict-runtime-verify-2026-05-23T22-31-27-886Z.json`
- Protected scope maintained (no UI, renderer, MOS, tracking calculation, pricing, or unrelated storage logic changes).

## 2026-05-24 - Retention Lifecycle Fix: deleteAfterAt Enforcement

### Scope
Fixed backend retention cleanup lifecycle so expiry cleanup uses `LabelJob.deleteAfterAt` directly.

### Implemented
- Added delete-after enforcement in cleanup cron using `LabelJob.deleteAfterAt` for expired completed jobs.
- Enforced retention lifecycle windows already persisted by worker:
  - `FREE`: 24 hours
  - `PAID`: 72 hours
- Added dual-provider artifact cleanup in retention path:
  - Local artifact deletion
  - R2 artifact deletion
- Added tracking master cleanup in retention path:
  - `trackingMasterPath` primary
  - deterministic legacy fallback path preserved
- Preserved legacy compatibility by keeping scheduled cleanup fallback (`job_deletion_schedules`) for historical/manual flows.

### Protected Scope Compliance
- No UI changes.
- No renderer changes.
- No MOS logic changes.

### Verification
- `npm run build` -> PASS
- `npm run strict-runtime-verify` -> PASS
- Direct DB retention job simulation -> BLOCKED (database unreachable at `localhost:5432`)

### Risk Remaining
- End-to-end DB-backed retention deletion simulation remains pending until PostgreSQL connectivity is restored.

## 2026-05-24 - Phase A/B/C Completion: Backend Reliability, Observability, and Retrieval Latency

### Scope
Documentation of completed Phase A/B/C implementation under Protected Scope Protocol.

### Phase A - deleteJobById Consistency
- Implemented `deleteJobById` consistency remediation.
- Implemented dual provider cleanup path for tracking master artifact deletion.
- `trackingMasterPath` is now the source-of-truth deletion path when present.
- Deterministic legacy fallback path is preserved for compatibility with historical null rows.

### Phase B - trackingMaster Observability Parity
- Added nullable `trackingMasterSyncedAt` in `LabelJob`.
- Implemented observability parity with existing synced timestamp patterns.
- Extended provider sync tracking for `trackingMasterXlsx` lifecycle.

### Phase C - Retrieval Latency Optimization
- Implemented tracking master retrieval latency optimization.
- Added null-path guarded R2 probe to reduce false-negative not-found responses.
- Reduced duplicate local polling in tracking master retrieval flow.
- Preserved strict retrieval priority: `DB -> LOCAL -> R2`.

### Protected Scope Compliance
- No label renderer logic changes.
- No money order logic changes.
- No MOS logic changes.
- No UI changes.
- No universal label rendering changes.
- No tracking calculation logic changes.

## 2026-05-23 - Phase 1: Tracking Master Reliability

### Scope
Implemented Phase 1 only under Protected Scope Protocol.

### Implemented
- Added additive `LabelJob` fields:
  - `trackingMasterPath`
  - `deleteAfterAt`
  - `retentionTierSnapshot`
- Added additive migration:
  - `apps/api/prisma/migrations/20260523193000_phase1_tracking_master_reliability/migration.sql`
- Persisted `trackingMasterPath` at job completion when tracking master XLSX is generated.
- Persisted retention snapshot metadata at completion:
  - `deleteAfterAt`
  - `retentionTierSnapshot` (`FREE`/`PAID` based on active subscription plan price)
- Enforced tracking master endpoint resolution priority:
  1. DB persisted path
  2. Deterministic local path
  3. R2 fallback
- Corrected tracking master fallback to XLSX artifact resolution (no PDF fallback path).
- Separated storage semantics:
  - `tracking-result.json` remains tracking result artifact semantics.
  - `tracking-master.xlsx` now has distinct artifact semantics (`trackingMasterXlsx`).
- Preserved legacy compatibility:
  - old jobs with `NULL trackingMasterPath` continue to resolve through deterministic local fallback.
- Added telemetry/logging for tracking master resolution source:
  - `DB`
  - `LOCAL`
  - `R2`

### Protected Scope Compliance
No changes made to:
- Universal Label renderer internals
- Money Order renderer internals
- MOS logic
- Label layouts
- Tracking calculation logic

### Verification
- `npm run prisma:generate --workspace=@labelgen/api` -> PASS
- `npm run build` -> PASS
- `npm run phase-3-verify` -> PASS
- `npm run strict-runtime-verify` -> PASS

### Runtime Verification Constraints
The requested runtime sequence requiring live API/DB/R2 flow was partially blocked:
- Docker daemon unavailable in environment (`docker compose up -d` failed)
- Local PostgreSQL unavailable (`P1001` on migration/apply)

Blocked sequence steps:
- Generate labels via live backend
- Download tracking master via live endpoint
- Restart backend and re-download
- Delete local generated folder and verify R2 fallback live
- Verify legacy job downloads against live backend

These must be executed once PostgreSQL + Docker/R2 test environment is available.
