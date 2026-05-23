# Implementation Notes - Phase 1 Tracking Master Reliability

## 2026-05-24 Addendum - Final Live Railway Upload Verification PASS

### Deployment Verification
- API deployment `a8453673-770e-4a03-ba2b-90774b0060a8` reached `SUCCESS`.
- Worker deployment `456da23d-5b3d-42f1-b07e-3855fe7ce082` reached `SUCCESS`.

### Migration Verification (Production)
- Live API deployment logs show:
  - `Applying migration 20260524041000_add_tracking_master_synced_at`
  - `All migrations have been successfully applied.`
  - Startup confirms `14 migrations found` and `No pending migrations to apply.`

### Health Verification
- `GET /health` -> `200` with `{"status":"ok"}`
- `GET /health/worker` -> `200` (worker healthy)

### Real Upload Verification
- Live upload route executed with same source filename path (`lcs 17-13-11-2024.xls`).
- API logs confirm request completed past parser + unit checks and enqueue:
  - `POST /api/upload`
  - `Job added (filePath+fileBuffer dual-mode): 04729f8d-694c-4e23-8516-b75eb62d0a85`
- API then served job status/download requests for the same `jobId`.

### Worker / Queue Verification
- Worker logs confirm BullMQ pickup and processing of same `jobId`:
  - `Processing job 04729f8d-694c-4e23-8516-b75eb62d0a85`
  - `Parsing success ... Rows: 10`
  - `Labels output file path: /app/storage/generated/04729f8d-694c-4e23-8516-b75eb62d0a85-labels.pdf`

### P2022 Clearance
- Previous `P2022` (`LabelJob.trackingMasterSyncedAt` missing) is resolved in latest deployment window.
- No recurrence found in latest API logs after migration applied.

### Final Outcome
- Upload flow no longer stalls at `Uploading` for the verified live case.
- LabelJob creation, queue handoff, worker processing, and output retrieval signals are all present.

### Protected Scope Compliance
- No UI layout/design changes.
- No label renderer changes.
- No money order renderer changes.
- No MOS logic changes.
- No tracking calculation logic changes.
- No pricing logic changes.
- No unrelated storage logic changes.

## 2026-05-24 Addendum - Final Retention Verification PASS

### Final Status
- Retention cleanup validation is now PASS.

### Verification Evidence
- Build: `npm run build` -> PASS
- Strict runtime: `npm run strict-runtime-verify` -> PASS
  - `forensic-artifacts/strict-runtime-verify-2026-05-23T22-31-27-886Z.json`
- Latest retention cleanup forensic evidence:
  - `forensic-artifacts/retention-cleanup-verify-2026-05-23T22-07-20-559Z.json`
  - `pass: true`
  - `dbRemaining: []`
  - `trackingRemaining: []`
  - `localRemaining: []`
  - `r2Enabled: true`
  - `r2Verified: true`

### Protected Scope Compliance
- No UI changes.
- No label renderer changes.
- No money order renderer changes.
- No MOS logic changes.
- No tracking calculation logic changes.
- No pricing logic changes.
- No unrelated storage logic changes.

## 2026-05-24 Addendum - Retention deleteAfterAt Enforcement

### Objective
Fix retention cleanup lifecycle so backend deletion is driven by `LabelJob.deleteAfterAt` instead of only legacy scheduled cleanup pathways.

### Implementation Summary
- Added `cleanupExpiredLabelJobsByDeleteAfterAt()` in cleanup cron flow.
- Cleanup now scans expired `LabelJob` rows (`deleteAfterAt <= now`) excluding active queue states.
- For each expired job, cleanup now removes:
  - local upload artifact
  - local/R2 labels artifact
  - local/R2 money-order artifact
  - local/R2 tracking result artifact
  - local/R2 tracking master artifact
- Tracking master cleanup preserves compatibility:
  - DB path when present
  - deterministic legacy fallback path
- DB cleanup after artifact removal:
  - delete related `TrackingJob`
  - delete expired `LabelJob`
  - delete any legacy `job_deletion_schedules` entry for same job id

### Legacy Compatibility
- Existing `cleanupScheduledJobDeletions()` remains active for historical/manual schedules.
- This preserves cleanup for rows that do not rely on `deleteAfterAt`.

### Protected Scope Compliance
- No UI changes.
- No renderer changes.
- No MOS logic changes.

### Verification Performed
- `npm run build` -> PASS
- `npm run strict-runtime-verify` -> PASS

### Verification Blocker
- Direct DB-backed retention simulation (creating expired FREE/PAID jobs and validating delete) is blocked because PostgreSQL is unreachable (`localhost:5432`).
- Result: compile/runtime suites passed, but end-to-end retention deletion simulation remains pending environment recovery.

## 2026-05-24 Addendum - Phase A/B/C Completion

This addendum documents finalized implementation completion for Phase A, Phase B, and Phase C.
It is documentation-only and does not introduce additional behavior beyond completed backend changes.

### Phase A Completion
- deleteJobById consistency remediation completed.
- Dual-provider cleanup implemented for tracking master artifact deletion.
- `trackingMasterPath` enforced as source-of-truth deletion path where available.
- Deterministic legacy fallback retained for historical compatibility.

### Phase B Completion
- Nullable `trackingMasterSyncedAt` added to `LabelJob`.
- Observability parity implemented for tracking master sync lifecycle.
- Provider sync tracking extended to cover `trackingMasterXlsx` with null-safe behavior.

### Phase C Completion
- Retrieval latency optimization implemented for tracking master download flow.
- Null-path guarded R2 probe implemented to reduce false-negative 404 outcomes.
- Duplicate local polling reduced while preserving reliability checks.
- Resolution order preserved as `DB -> LOCAL -> R2`.

### Protected Scope Compliance
- No label template logic changes.
- No money order generation logic changes.
- No MOS logic changes.
- No UI/rendering workflow changes.
- No universal label layout logic changes.
- No tracking calculation logic changes.

## Objective
Implement Phase 1 reliability for tracking master artifact handling only, without touching protected rendering and business logic surfaces.

## Files Changed
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260523193000_phase1_tracking_master_reliability/migration.sql`
- `apps/api/src/worker.ts`
- `apps/api/src/routes/jobs.ts`
- `apps/api/src/storage/paths.ts`
- `apps/api/src/storage/provider.ts`
- `apps/api/src/storage/key-normalization.ts`
- `apps/api/src/storage/R2StorageProvider.ts`
- `CHANGELOG.md`
- `IMPLEMENTATION_NOTES.md`

## Data Model Changes (Additive)
Added to `LabelJob`:
- `trackingMasterPath String?`
- `deleteAfterAt DateTime?`
- `retentionTierSnapshot String?`
- Index: `@@index([deleteAfterAt])`

Migration is additive-only and non-breaking for existing rows.

## Persistence Updates
At label job completion:
- `trackingMasterPath` is persisted when XLSX is generated.
- `retentionTierSnapshot` is persisted as `FREE` or `PAID`.
- `deleteAfterAt` is persisted as:
  - `FREE`: now + 24h
  - `PAID`: now + 72h

## Endpoint Resolution Behavior
Tracking master download now resolves in strict order:
1. DB persisted `trackingMasterPath`
2. Deterministic local path (`{jobId}-tracking-master.xlsx`)
3. R2 fallback via dual-read

Telemetry/logging emits resolution source:
- `DB`
- `LOCAL`
- `R2`

## Artifact Semantics Separation
Introduced explicit tracking master artifact semantics:
- `tracking-result.json` -> tracking result artifact (`trackingResult`)
- `tracking-master.xlsx` -> tracking master artifact (`trackingMasterXlsx`)

This separation is reflected in:
- key normalization
- compatibility lookup metadata validation
- R2 fallback key/type resolution
- dual-upload sync context handling

## Legacy Compatibility
Old jobs with `NULL trackingMasterPath` still resolve via deterministic path fallback.
No hard dependency on new fields for previously completed jobs.

## Verification Performed
### Successful
- Prisma client generation
- Workspace build
- Phase 3 verification script
- Strict runtime verification script

### Environment Blockers
Live integration steps requested by protocol could not be completed because:
- Docker daemon unavailable
- Local PostgreSQL unavailable

Blocked live steps:
1. Generate labels against live backend
2. Download tracking master
3. Restart backend and re-download
4. Delete local generated folder and verify R2 fallback
5. Verify old job downloads live

## Deferred Live Verification Checklist
Run when DB + Docker + R2 are available:
1. Start infra and ensure API+worker healthy.
2. Create a new job and confirm `trackingMasterPath` persisted.
3. Download tracking master (expect `DB` source telemetry).
4. Restart backend and download again (expect DB/local source remains valid).
5. Remove local generated tracking master file.
6. Download again and confirm R2 fallback (`R2` source telemetry).
7. Attempt download for old pre-migration job with null `trackingMasterPath`.
8. Confirm deterministic fallback succeeds.
