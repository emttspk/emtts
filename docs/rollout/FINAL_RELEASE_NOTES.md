# Final Release Notes

Date: 2026-05-19  
Release: Production Rollout Complete  
Status: Approved for production operation

## Production Rollout Summary

This release closes the staged production hardening program and confirms safe 100% operation for the dedicated worker topology with local-first storage authority and R2 dual-write/read fallback.

## Dedicated Worker Migration Summary

- API and Worker ownership boundaries were preserved and enforced.
- API remains queue producer and authenticated download gateway.
- Worker remains queue consumer and artifact generator.
- Worker-local artifact persistence remains authoritative for write path.
- Worker filePath ENOENT fallback to embedded fileBuffer remained healthy under container isolation.

## R2 Rollout Summary

- Dual-write rollout progressed through staged canary and reached 100%.
- Final runtime confirmation showed canary runtime percentage at 100 on Worker.
- Final cohort showed successful dual-write replication for all validation jobs.
- No `r2_upload_failed` observed in final validation window.

## Retrieval Fallback Fix Summary

Root cause resolved:
- API fallback path previously attempted remote existence/read checks using a worker-local stored path shape, which is not portable across isolated API and Worker containers.

Implemented fix:
- Fallback resolution now derives remote lookup key from metadata (jobId + artifactType) when available.
- Local-first behavior remains unchanged.
- No queue ownership changes, no storage-provider redesign, no telemetry model changes.

Verification result:
- Final 10-job cohort completed and downloaded successfully (10/10).
- No `404 File not found on disk` in final 100% cohort.

## Final Architecture Topology

- Web -> API -> Redis/BullMQ -> Dedicated Worker
- Worker -> Local storage (authoritative write)
- Worker -> R2 (async dual-write replication)
- API -> Local-first read
- API -> R2 fallback read/stream on local-miss when eligible
- PostgreSQL remains system of record for job and path metadata

## Telemetry Validation Summary

Observed in final validation window:
- `dual_write_canary_allowed` present across final cohort
- `dual_write_success` present across final cohort
- `dual_read_fallback` then `provider_fallback=r2` then `stream_success`
- No `stream_failure` in final cohort
- No `stream_timeout` in final cohort
- No `r2_upload_failed` in final cohort

## Operational Maturity Statement

Operational maturity for the rollout and retrieval-fallback track is assessed as production-complete:

- Stable dedicated worker processing
- Stable dual-write/dual-read fallback behavior at 100%
- Customer-visible label retrieval validated end-to-end
- Rollback remains immediate via prior Railway deployments

## Final Pushed Commits

- `0a72c3b` - Fix label download fallback and finalize rollout docs
- `f33740c` - Remove superseded flat docs after normalization

## Tracking Result JSON R2 Migration (May 27, 2026)

Expansion of R2 dual-write and fallback architecture to tracking result JSON artifacts.

### What's New

- **Tracking JSON artifacts now sync to R2** with normalized key pattern: `json/{env}/{jobId}/tracking-result.json`
- **R2 fallback retrieval** for tracking endpoint when local JSON unavailable
- **Cleanup protection** extended to tracking artifacts via `resultSyncedAt` tracking column
- **New telemetry events** for tracking JSON dual-write and fallback operations

### Technical Changes

Modified files:
- `apps/api/src/worker.ts` — Dual-write at initial and final tracking result generation
- `apps/api/src/cron/cleanup.ts` — Extended sync protection for tracking artifacts
- `apps/api/src/routes/tracking.ts` — R2 fallback retrieval with telemetry
- `apps/api/src/storage/key-normalization.ts` — Normalized key generation for JSON

### Artifact Coverage Update

All three artifact types now have complete dual-write and fallback support:

| Type | R2 Key | Fallback | Sync Column | Status |
|---|---|---|---|---|
| Labels PDF | `pdf/{env}/{jobId}/labels.pdf` | ✅ Enabled | `labelsPdfSyncedAt` | ACTIVE |
| Money Orders PDF | `pdf/{env}/{jobId}/money-orders.pdf` | ✅ Enabled | `moneyOrderPdfSyncedAt` | ACTIVE |
| Tracking JSON | `json/{env}/{jobId}/tracking-result.json` | ✅ Enabled | `resultSyncedAt` | NEW |

### Telemetry Events

New telemetry signals for tracking JSON migration:
- `tracking_result_dual_write_start` — R2 sync initiated
- `tracking_result_dual_write_success` — R2 sync completed
- `tracking_result_stream_success` — Fallback retrieval succeeded
- `tracking_result_stream_failure` — Fallback retrieval failed

### Validation Summary

All validation checks passed:
- Build clean (0 TypeScript errors)
- Key normalization verified
- Worker dual-write implementation confirmed
- Cleanup protection active
- R2 fallback logic functional
- All provider exports available

## Canonical Closure References

- `FINAL_PROJECT_SIGNOFF.md` (Section 13: Tracking Result JSON R2 Migration)
- `PRODUCTION_PHASE1_READY.md`
- `docs/architecture/storage-rollout-architecture.md`
- `docs/rollout/storage-rollout-runbook.md`
