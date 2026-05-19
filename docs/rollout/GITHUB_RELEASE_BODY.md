# GitHub Release: v1.0-production-rollout-complete

**Date:** May 19, 2026  
**Project:** Epost / Label Generator  
**Environment:** Railway production  
**Status:** Production-complete. Repository is now maintenance-only.

---

## Production Rollout Summary

This release closes the full staged production hardening program for the Label Generator.
All systems confirmed stable at 100% dual-write R2 canary traffic with local-first authority.

---

## Worker Migration Summary

- Dedicated Worker topology activated (`START_WORKER_IN_API=false` on both Api and Worker).
- Worker-only queue consumption confirmed; no dual-consumption or duplicate processing observed.
- Worker ENOENT on upload input file is expected and handled: falls through to `embedded fileBuffer`.
- All services Online: Api, Worker, Python, Web, Redis, Postgres.

---

## R2 Rollout Summary

- `R2_CANARY_MODE=job-percentage` active on both Api and Worker.
- `R2_CANARY_PERCENTAGE=100` confirmed on both services.
- `STAGING_R2_ENABLED=true` confirmed on both services.
- R2 startup connectivity check: `connectivity=true, uploadable=true, downloadable=true, presignedUrl=true`.

### Telemetry Evidence (Job `0dc67b44-61e4-4062-8f70-7971ae28c3fe`)

| Event | Outcome |
|---|---|
| `dual_write_canary_allowed` | ✅ `reason=percentage_allowed` |
| `r2_upload_latency` (labelsPdf) | ✅ 878ms, `outcome=success` |
| `dual_write_success` (labelsPdf) | ✅ `provider=r2` |
| `dual_write_success` (moneyOrderPdf) | ✅ `provider=r2`, 789ms |
| `dual_read_fallback` → `provider_fallback=r2` | ✅ Both artifacts |
| `stream_success` (labelsPdf) | ✅ 979ms |
| `stream_success` (moneyOrderPdf) | ✅ 1546ms |
| No `r2_upload_failed` | ✅ Zero failures |
| No `stream_failure` | ✅ Zero failures |

---

## Retrieval-Fix Summary

**Root cause:** API fallback path attempted remote reads using worker-local path shapes, which are not portable across isolated containers.  
**Fix:** Fallback resolution now derives remote key from metadata (jobId + artifactType).  
**Result:** No `404 File not found on disk` in final validation window.

---

## Repo Maintenance State

- Build: ✅ Clean (`tsc` + `postbuild.cjs`)
- `.gitignore`: Hardened — excludes `tasks.json`, `ISOLATION_STRATEGY.md`, and all transient artifacts.
- Docs: Normalized into `docs/architecture/`, `docs/operations/`, `docs/rollout/`, `docs/forensics/archive/`.
- No accidental secrets committed.
- No broken markdown references in active docs.

---

## Final Tag Reference

- Tag: `v1.0-production-rollout-complete`
- Commit: `4f12486`

Repository is now fully maintenance-only.