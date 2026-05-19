# Phase 10C Telemetry Visibility Verification
# Production Observability Remediation Record

**Date:** May 19, 2026  
**Scope:** Telemetry visibility only (no storage/canary logic changes)  
**Environment:** Railway production target + local safety verification  
**Status:** IMPLEMENTED, awaiting production log confirmation

---

## 1) Root Cause

Structured telemetry emission was implemented and reachable, but sink behavior allowed file-only output when `TELEMETRY_LOG_FILE` was set.

Prior behavior in `apps/api/src/telemetry.ts`:
- If `TELEMETRY_LOG_FILE` existed: events appended to file only
- Else: events written to stdout

Operational impact:
- Railway log stream can appear to have missing telemetry events when file sink is active.

---

## 2) Exact Fix

### 2.1 Telemetry Sink Mode Upgrade

`apps/api/src/telemetry.ts` now supports runtime sink modes:
- `stdout`
- `file`
- `both`

Behavior now:
- `TELEMETRY_LOG_FILE` + `TELEMETRY_STDOUT_DUPLICATE!=false` => `sink="both"`
- `TELEMETRY_LOG_FILE` + `TELEMETRY_STDOUT_DUPLICATE=false` => `sink="file"`
- no `TELEMETRY_LOG_FILE` => `sink="stdout"`

### 2.2 Startup Sink Diagnostics

Added startup event:

```json
{
  "event": "telemetry_sink_initialized",
  "sink": "stdout|file|both",
  "telemetryLogFile": "...",
  "stdoutDuplicateEnabled": true,
  "environment": "production",
  "pid": 1234,
  "ts": "..."
}
```

### 2.3 Canary Runtime Snapshot Event

Added startup event:

```json
{
  "event": "canary_runtime_configuration",
  "enabled": true,
  "mode": "job-percentage",
  "percentage": 5,
  "dualWriteEnabled": true,
  "dualReadEnabled": true,
  "r2UploadsEnabled": true,
  "normalizedKeysEnabled": true,
  "telemetrySink": { "sink": "both", "telemetryLogFile": "..." }
}
```

Emitted by:
- API startup (`apps/api/src/index.ts`)
- Worker startup (`apps/api/src/worker.ts`)

---

## 3) Telemetry Event Catalog (Phase 10C Canonical)

### 3.1 Upload/Canary Events

- `dual_write_start`
- `dual_write_success`
- `dual_write_failure`
- `dual_write_canary_allowed`
- `dual_write_canary_skip`
- `object_key_version_logged`
- `dual_write_stream_start`
- `dual_write_stream_cleanup`

### 3.2 Resolver/Fallback/Stream Events

- `dual_read_fallback`
- `provider_fallback`
- `stream_start`
- `stream_success`
- `stream_timeout`
- `stream_failure`
- `stream_cleanup`

### 3.3 Compatibility Lookup Events

- `compatibility_lookup_attempt`
- `compatibility_lookup_hit`
- `compatibility_lookup_miss`
- `compatibility_lookup_metadata_bypass`

### 3.4 Startup/Config Events

- `telemetry_sink_initialized`
- `canary_runtime_configuration`
- `staging_startup_config`
- `staging_r2_connectivity_check`
- `staging_canary_initialized`

### 3.5 Name Mapping Clarification

Operator shorthand vs runtime names:
- `canary_allowed` => `dual_write_canary_allowed`
- `canary_skipped` => `dual_write_canary_skip`
- `compatibility_lookup` => `compatibility_lookup_attempt|hit|miss|metadata_bypass`

---

## 4) Verification Evidence

### 4.1 Build Safety

- `npm run build --workspace=@labelgen/api` => PASS (exit 0)
- `npm run typecheck --workspace=@labelgen/api` => PASS (exit 0)

### 4.2 Startup Visibility Smoke Test (Local)

Observed on stdout:
- `telemetry_sink_initialized`
- `canary_runtime_configuration`
- `staging_startup_config`

Sample observed output:

```json
{"event":"telemetry_sink_initialized","sink":"stdout","telemetryLogFile":null,"stdoutDuplicateEnabled":true,"environment":"development","pid":9384,"ts":"2026-05-19T00:24:06.121Z"}
{"event":"canary_runtime_configuration","enabled":false,"mode":"job-count","maxJobs":1,"dualWriteEnabled":true,"dualReadEnabled":false,"r2UploadsEnabled":true,"normalizedKeysEnabled":false,"telemetrySink":{"sink":"stdout","telemetryLogFile":null,"stdoutDuplicateEnabled":true,"maxLogLines":10000,"currentLogLines":1},"ts":"2026-05-19T00:24:06.122Z"}
```

### 4.3 Railway Verification Screenshots/Logs (Operator Fill)

Attach after production deploy:

1. `telemetry_sink_initialized` event in Railway API logs
2. `canary_runtime_configuration` event in Railway API logs
3. `telemetry_sink_initialized` event in Railway Worker logs
4. One real upload showing:
   - `dual_write_start`
   - `object_key_version_logged`
   - `dual_write_success` OR `dual_write_canary_skip`

Evidence links/placeholders:
- Screenshot/API sink init: ______________________
- Screenshot/API canary runtime: ______________________
- Screenshot/Worker sink init: ______________________
- Screenshot/upload telemetry chain: ______________________

---

## 5) Rollback Safety Assessment

No storage/canary/runtime execution behavior was changed.

Unchanged guarantees:
- Local-first write authority remains intact
- Canary selection logic unchanged
- Dual-write/fallback logic unchanged
- Cleanup logic unchanged
- Key generation logic unchanged
- Rollback commands unchanged

If needed, telemetry visibility-only rollback is immediate:
- Set `TELEMETRY_STDOUT_DUPLICATE=false` (optional)
- Redeploy

This rollback affects observability only, not artifact correctness.

---

## 6) Operational Status

### VERIFIED

- Telemetry emitters exist and are reachable in upload/fallback/startup paths
- Sink diagnostics event added and visible in runtime stdout during smoke run
- Canary runtime startup event added and visible in runtime stdout during smoke run
- Build/typecheck clean after changes

### NOT OBSERVED

- Production Railway post-fix startup event evidence (pending operator capture)
- Production upload telemetry chain post-fix (pending operator-triggered upload)

### INCONCLUSIVE

- Current live production sink mode value until post-deploy logs are captured
- Whether current production canary jobs are predominantly allowed vs skipped until counters are observed post-fix

---

## 7) Phase 10C Decision

**Decision:** SAFE TO CONTINUE AT 5%

Rationale:
- Fix is observability-only and production-safe
- No functional storage/canary behavior changes
- Production telemetry visibility must be verified immediately after deploy before any 25% increase decision

**25% increase gate remains CLOSED** until post-fix Railway evidence confirms:
1. startup sink events visible, and  
2. at least one real upload emits required telemetry chain.
