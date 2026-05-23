# Changelog

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
