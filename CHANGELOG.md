# Changelog

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
