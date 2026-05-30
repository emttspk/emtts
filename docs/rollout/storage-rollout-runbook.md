# Storage Rollout Operational Runbook

## Scope

Operational rollout and incident runbook for storage dual-write/dual-read fallback architecture.

This runbook covers:

- staging rollout
- production canary rollout
- rollback
- R2 outage handling
- degraded-mode handling
- memory-pressure incidents
- observability verification
- cleanup validation
- stream concurrency monitoring

Additionally for Aggregator Booking Phase A metadata readiness:

- additive DB metadata rollout for quote source objects and booking documents
- metadata-only API attach/list checks for aggregator booking documents
- explicit no-change boundary for generation path, cleanup cron behavior, and fallback read preference

## Preconditions

- Build passes for API and worker.
- DB reachable for normal operations.
- Redis reachable for normal queue operations.
- R2 credentials configured with supported aliases:
  - `R2_ACCESS_KEY_ID` or `R2_ACCESS_KEY`
  - `R2_SECRET_ACCESS_KEY` or `R2_SECRET_KEY`
- `R2_BUCKET` and `R2_ENDPOINT` configured.

## Infrastructure Bootstrap Checklist

Before S0, confirm the environment is operational enough to distinguish rollout defects from missing infrastructure:

1. Start PostgreSQL and Redis.
2. Verify PostgreSQL is reachable on the host in `DATABASE_URL`.
3. Verify `REDIS_URL` is not missing and not a placeholder value.
4. Run API and worker once and inspect startup logs.
5. Do not begin S1 until startup logs report `FULLY_READY`.

## Startup Readiness States

- `FULLY_READY`: PostgreSQL and Redis are both reachable. Safe to proceed with S0 functional checks and later staged rollout steps.
- `DEGRADED_NO_DB`: PostgreSQL unavailable. API may bind, but DB-backed routes, plan seed, queue recovery, and worker execution are blocked.
- `DEGRADED_NO_REDIS`: Redis unavailable. API may bind, but queue recovery and BullMQ worker startup are blocked.
- `DEGRADED_NO_DB_OR_REDIS`: Both unavailable. Treat as infrastructure/bootstrap failure, not a rollout signal.

## Feature Flags (Exact)

- `STORAGE_PROVIDER`
- `ENABLE_DUAL_WRITE`
- `ENABLE_DUAL_READ`
- `ENABLE_R2_UPLOADS`
- `ENABLE_R2_DOWNLOADS`

## Default Safe Baseline

- Keep all rollout flags disabled by default.
- Keep `STORAGE_PROVIDER=local` for local-first authoritative behavior.

## Aggregator Phase A Boundary Rules

- Do not modify `apps/api/src/routes/jobs.ts` generation/upload path.
- Do not change cleanup deletion decisions in `apps/api/src/cron/cleanup.ts`.
- Do not switch read preference to remote-first.
- Do not alter worker execution flow for label/MO generation.
- Treat Phase A as schema/API metadata capture only.

## Rollout Sequence

```mermaid
flowchart TD
  A[Deploy code with all flags off] --> B[Staging dual-write enable]
  B --> C[Validate sync markers and dual-write telemetry]
  C --> D[Staging dual-read enable]
  D --> E[Validate fallback streaming and observability]
  E --> F[Production canary dual-write]
  F --> G[Production canary dual-read]
  G --> H[Scale rollout if go criteria pass]
```

## Staging Rollout Procedure

### Phase S0: No-Flag Baseline

1. Deploy latest build with flags off.
2. Confirm API and worker startup logs report `FULLY_READY`.
3. Confirm local-only behavior remains unchanged.
4. Confirm no startup validation failures.

### S0 Go/No-Go Interpretation

- `FULLY_READY`: continue to S0 smoke validation and only then consider S1.
- Any `DEGRADED_*` state: stop, fix infrastructure first, and re-run S0 baseline validation.

### Phase S1: Enable dual-write mirror

1. Set:
   - `ENABLE_DUAL_WRITE=true`
   - `ENABLE_R2_UPLOADS=true`
2. Keep:
   - `ENABLE_DUAL_READ=false`
3. Validate:
   - uploads complete
   - local artifacts present
   - R2 mirror uploads successful
   - sync markers updated
4. Verify telemetry:
   - `dual_write_start`
   - `dual_write_stream_start`
   - `dual_write_success`
   - `dual_write_stream_cleanup`

### Phase S2: Enable dual-read fallback

1. Set:
   - `ENABLE_DUAL_READ=true`
2. Keep `STORAGE_PROVIDER=local`.
3. Force local-miss test for controlled artifacts.
4. Verify fallback streaming path from R2:
   - labels
   - money-order PDFs
5. Verify telemetry:
   - `dual_read_fallback`
   - `provider_fallback`
   - `stream_start`
   - `stream_success`
   - `stream_cleanup`

### Phase S3: Stress and edge validation

1. Run concurrent fallback downloads.
2. Confirm semaphore behavior and queue-hit detection.
3. Confirm no leaked active stream gauges after abort/error.
4. Confirm cleanup safety when dual-write enabled.

## Production Canary Rollout Procedure

### Canary P0: Deploy with flags off

- Confirm baseline parity with pre-rollout behavior.

### Canary P1: Limited dual-write enable

1. Enable dual-write + R2 uploads for a controlled period.
2. Monitor:
   - upload success/failure rates
   - sync marker update health
   - active dual-write gauge cleanup behavior

### Canary P2: Limited dual-read enable

1. Enable dual-read on canary slice.
2. Monitor:
   - fallback success/failure/timeout/abort rates
   - stream cleanup consistency
   - memory and process stability

### Canary P3: Expand or rollback decision

- Expand only if go criteria pass for the observation window.

## Rollback Procedure

### Immediate rollback (flags)

1. Set `ENABLE_DUAL_READ=false`.
2. Set `ENABLE_DUAL_WRITE=false` if mirror path must stop.
3. Set `ENABLE_R2_UPLOADS=false` if R2 path must fully disable.
4. Restart affected services.

### Post-rollback validation

- local-only downloads work
- new jobs complete
- no unresolved queue failures
- no startup validation errors

## R2 Outage Handling Runbook

### Symptoms

- rising `stream_failure` or `stream_timeout`
- `provider_fallback` errors
- dual-write failure spikes

### Actions

1. Disable fallback read path first: `ENABLE_DUAL_READ=false`.
2. If required, disable mirror writes: `ENABLE_DUAL_WRITE=false` and `ENABLE_R2_UPLOADS=false`.
3. Keep local authoritative path active.
4. Verify service stability and customer-facing download recovery.

### Recovery

1. Restore R2 connectivity.
2. Re-enable flags in staged order (dual-write first, then dual-read).

## Degraded-Mode Handling Runbook

### Expected degraded behavior

- R2 existence probes fail closed.
- API remains available.
- local-first behavior remains authoritative.
- fallback responses return normal not-found/unavailable outcomes when remote not usable.

### Operator checklist

- confirm no crash loops
- confirm local downloads succeed
- verify fallback errors are observable via telemetry

## Memory-Pressure Incident Runbook

### Primary signals

- elevated heap usage
- process restarts or OOM indicators
- high concurrent fallback stream load

### Actions

1. Verify stream routes are active (not buffered fallback paths).
2. Reduce fallback pressure by disabling `ENABLE_DUAL_READ` temporarily.
3. Inspect stream telemetry and timeout/failure ratios.
4. Verify active stream gauge returns to baseline after load subsides.

### Recovery criteria

- heap stabilizes
- no OOM/restart loop
- stream cleanup telemetry confirms closure

## Observability Verification Runbook

### Metrics checklist

- `activeR2StreamsGauge`
- `r2StreamDuration`
- `r2StreamFailures`
- `r2ConcurrencyLimitHits`
- `r2TimeoutCounter`
- `r2FailureCounter`
- `activeDualWritesGauge`

### Telemetry checklist

- dual-write events:
  - `dual_write_start`
  - `dual_write_stream_start`
  - `dual_write_success`
  - `dual_write_failure`
  - `dual_write_stream_cleanup`
- dual-read/fallback events:
  - `dual_read_fallback`
  - `provider_fallback`
- stream lifecycle:
  - `stream_start`
  - `stream_success`
  - `stream_failure`
  - `stream_timeout`
  - `stream_abort`
  - `stream_cleanup`
- contention visibility:
  - `concurrency_limit_hit`

## Cleanup Validation Runbook

### Validate sync-aware deletion behavior

1. With dual-write enabled, verify unsynced PDFs are not deleted by cleanup.
2. Verify synced PDFs become eligible according to retention logic.
3. Confirm no active queue/job artifacts are removed.
4. Confirm scheduled deletions remove files and DB rows consistently.

### Failure-mode checks

- DB unavailable cleanup run should skip safely.
- No destructive behavior on temporary connectivity issues.

## Stream Concurrency Monitoring Runbook

### What to watch

- active stream snapshots from `stream_start` and `stream_cleanup`
- `r2ConcurrencyLimitHits`
- `concurrency_limit_hit` event rate
- timeout/failure ratios under concurrency

### Go/No-Go thresholds (operator-defined)

- Go when:
  - stream cleanup returns gauges to baseline
  - timeout/failure rates remain within acceptable operational threshold
  - no memory instability under representative load
- No-Go when:
  - persistent gauge leak is observed
  - repeated timeout storms under normal load
  - user-visible download failure rate exceeds threshold

## Canary Go/No-Go Criteria

### Go

- startup validation passes with configured aliases
- dual-write success is stable
- fallback streaming success is stable
- no gauge leaks
- cleanup safety checks pass

### No-Go

- startup credential validation mismatch
- unresolved stream failures/timeouts under normal load
- memory instability or restart loops
- cleanup deletes unsynced artifacts

## Final Operator Notes

- Do not enable all rollout flags at once.
- Preserve local-first authoritative design throughout staged rollout.
- Prefer rollback via flags before code rollback.
- Keep architecture and runbook docs in sync with deployed behavior.
