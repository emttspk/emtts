# Implementation Notes - Phase 1 Tracking Master Reliability

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
