# Deployment Status (Current Authoritative Snapshot)

**Last Updated:** 2026-05-18  
**Status:** FINAL PRE-STAGING DOCUMENTATION COMPLETE  
**Runtime posture:** local-first authoritative, rollback-safe, feature flags disabled by default

## What this document covers

This file is the current high-level deployment state pointer. Historical execution logs and one-off forensic notes are intentionally excluded from this status page.

## Authoritative references

- Architecture source of truth: `docs/architecture/storage-rollout-architecture.md`
- Operational source of truth: `docs/rollout/storage-rollout-runbook.md`
- Module dependency map: `docs/architecture/system-map.md`

## Final implemented architecture status

- API and worker are operationally separated.
- Queue ownership is explicit (API enqueue, worker consume).
- Local storage remains authoritative for writes and first reads.
- R2 mirror/fallback is flag-gated and staged.
- Label and money-order fallback downloads are streaming-safe.
- Stream concurrency is semaphore-protected.
- Timeout protections are active in remote read path.
- Cleanup is sync-aware when dual-write is enabled.
- Observability includes stream and dual-write lifecycle telemetry plus metrics.

## Feature flag baseline

Default expected state for safe baseline:

- `STORAGE_PROVIDER=local`
- `ENABLE_DUAL_WRITE=false`
- `ENABLE_DUAL_READ=false`
- `ENABLE_R2_UPLOADS=false`
- `ENABLE_R2_DOWNLOADS=false`

## R2 credential env alias support

Startup validation and provider runtime both support:

- `R2_ACCESS_KEY_ID` or `R2_ACCESS_KEY`
- `R2_SECRET_ACCESS_KEY` or `R2_SECRET_KEY`

This resolves prior staging validation mismatch risk.

## Operational readiness verdict

- Documentation readiness: complete
- Runbook readiness: complete
- Staging rollout docs: actionable
- Rollback docs: complete
- Runtime code changes required for this phase: none

## Remaining non-blocking technical debt

- Queue-hit detection for semaphore contention is best-effort and may undercount edge races.
- Telemetry has bounded per-process line cap and can drop excess logs under sustained bursts.

## Phase 4 Live Canary Update

- Authenticated single-job S1 canary completed successfully on 2026-05-18.
- Local PDF, sync marker, and R2 mirror were all verified.
- Redis host conflict was resolved by publishing Docker Redis on `6380` for the session.

Authoritative execution log: [../PHASE-4-LIVE-CANARY-FINAL-REPORT.md](../PHASE-4-LIVE-CANARY-FINAL-REPORT.md)
