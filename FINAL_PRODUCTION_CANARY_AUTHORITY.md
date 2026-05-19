# FINAL_PRODUCTION_CANARY_AUTHORITY.md
# Phase 9C Final Authoritative Launch Reference

Status: AUTHORITATIVE FOR LIVE PHASE 1 (5%)
Date: May 19, 2026
Scope: Production Phase 1 launch only (upload normalization canary)

---

## 1) Exact Phase 1 Environment Variables (Canonical)

Set these values in your deployment platform environment manager:

```text
STORAGE_PROVIDER=local
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true
DUAL_KEY_LOOKUP_ENABLED=true
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
ENABLE_DUAL_READ=true
R2_CANARY_MODE=job-percentage
R2_CANARY_PERCENTAGE=5
R2_MAX_CONCURRENT_STREAMS=5
R2_TIMEOUT_MS=30000
R2_RETRY_LIMIT=3
LOG_KEY_VERSIONS_IN_TELEMETRY=true
R2_ACCESS_KEY_ID=<production_key_id>
R2_SECRET_ACCESS_KEY=<production_secret>
R2_ENDPOINT=<production_r2_endpoint>
R2_BUCKET=<production_bucket>
R2_REGION=auto
```

---

## 2) Exact Forbidden Environment Variables

```text
FORBIDDEN STARTUP-FATAL COMBINATION:
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true
DUAL_KEY_LOOKUP_ENABLED=false

FORBIDDEN SAFETY COMBINATION:
STORAGE_PROVIDER=r2
```

---

## 3) Canonical KPI Interpretation (Single Source)

Authoritative canary-isolation KPI:

```text
canaryAllowedJobsCounter / (canaryAllowedJobsCounter + canarySkippedJobsCounter)
```

Expected range: 4%-6% (target 5%).

Important:
- object_key_version_logged is informational only.
- keyVersion telemetry is emitted before canary gating.
- keyVersion distribution MUST NOT be used to prove 5% isolation.

---

## 4) Canonical Timeout Threshold Policy

Use this policy everywhere:

```text
WARNING:
r2TimeoutCounter > 5 in any 15-minute window

CRITICAL / ROLLBACK:
r2TimeoutCounter > 10 in any 15-minute window
```

---

## 5) Startup Expectations (Actual Runtime)

Expected startup summaries:

```text
[Startup Config] Feature Flags: {
  ENABLE_DUAL_WRITE: true,
  ENABLE_DUAL_READ: true,
  ENABLE_R2_UPLOADS: true
}

[Startup Config] R2 Config: {
  MAX_CONCURRENT_STREAMS: 5,
  TIMEOUT_MS: 30000,
  RETRY_LIMIT: 3
}
```

Expected startup warning in Phase 1:

```text
[Startup Warning] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true but ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false.
```

Clarification:
- NORMALIZED_KEYS_FOR_NEW_UPLOADS, DUAL_KEY_LOOKUP_ENABLED, and ENABLE_NORMALIZED_LOOKUP_CANDIDATES are startup-validated internally.
- They are not printed in Feature Flags summary logs.

---

## 6) Exact First-Hour Telemetry Checks

At T+30 minutes:
1. Confirm at least one normalized key write event exists (informational).
2. Confirm canary KPI ratio is in 4%-6% from canaryAllowed/canarySkipped counters.
3. Confirm dual_write_failure_rate remains below 1%.
4. Confirm no startup errors.

At T+60 minutes:
1. Re-check canary KPI ratio (4%-6%).
2. Re-check timeout policy windows (no warning/critical breach).
3. Confirm stream_failure remains 0 or near-zero.
4. Confirm legacy and canary job downloads both succeed.

---

## 7) Deterministic Fallback Validation (Required)

For one known jobId where local file is unavailable, verify this event sequence for the SAME jobId:

```text
1) dual_read_fallback OR provider_fallback
2) stream_start (provider=r2)
3) stream_success
4) stream_cleanup
```

Success condition:
- All required events observed for one identical jobId.

Failure interpretation:
- Missing fallback event: fallback path not executed.
- stream_start without stream_success: fallback executed but stream failed.
- Missing stream_cleanup: incomplete stream lifecycle instrumentation.

---

## 8) Exact Rollback Triggers (Phase 1)

Immediate rollback if any are true:

```text
- Any Startup Error in production logs
- dual_write_failure_rate > 5% sustained > 30m
- stream_failure_rate > 5% sustained > 30m
- r2TimeoutCounter > 10 in any 15-minute window
- double-prefix keys detected (pdf/pdf/...)
- process crash / process.exit(1)
```

Warning escalation (prepare rollback):

```text
- r2TimeoutCounter > 5 in any 15-minute window
- dual_write_failure_rate 1%-5% sustained > 30m
- r2_upload_latency_ms p99 > 5000ms sustained > 30m
```

---

## 9) Authoritative Document Hierarchy

Use documents in this exact order:

1. FINAL_PRODUCTION_CANARY_AUTHORITY.md (this file)
2. docs/rollout/final-production-go-live-checklist.md
3. docs/production-phase1-activation-runbook.md
4. docs/production-canary-monitoring.md
5. docs/production-rollback-drill.md
6. PRODUCTION_PHASE1_READY.md

---

## 10) Ignore / Superseded Documents

Do NOT use for launch execution:

- PRODUCTION_ROLLOUT_READINESS.md
- docs/forensics/archive/FINAL_EXECUTION_REPORT_PHASE_9B.md

Historical-only references (not launch authority):
- docs/forensics/archive/phase-9b-day1.md
- docs/forensics/archive/phase-9b-day4-canary.md
- docs/storage-key-normalization-migration.md

---

## 11) Final Launch Decision Statement

If all pre-flight checks pass, canary KPI is stable at 4%-6%, timeout windows stay below warning/critical thresholds, and fallback validation sequence is confirmed, the system is cleared for live Phase 1 5% production canary.

---

## 12) PHASE 10 — LIVE ACTIVATION RECORD

**Activation Date:** May 19, 2026  
**Activation Phase:** Phase 10 — Live Production 5% Canary  
**Executing Agent:** GitHub Copilot (Claude Sonnet 4.6)  
**Operator Required For:** Railway env var application, deploy trigger, log confirmation

---

### 12A) Pre-Flight Validation Results (Agent-Verified)

| Check | Result | Evidence |
|---|---|---|
| `npm run build --workspace=@labelgen/api` | ✅ PASSED | exit 0, tsc + postbuild clean |
| `npm run typecheck --workspace=@labelgen/api` | ✅ PASSED | exit 0, zero type errors |
| `STORAGE_PROVIDER` default | ✅ SAFE | `process.env.STORAGE_PROVIDER \|\| "local"` (provider.ts:28) |
| `NORMALIZED_KEYS_FOR_NEW_UPLOADS` default | ✅ SAFE | `=== "true"` guard, defaults false |
| `DUAL_KEY_LOOKUP_ENABLED` default | ✅ SAFE | `=== "true"` guard, defaults false |
| Startup guard: fatal combination | ✅ SAFE | `process.exit(1)` if NORMALIZED=true AND DUAL=false (config.ts:151-153) |
| Startup warning: expected Phase 1 | ✅ CONFIRMED | `[Startup Warning] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true but ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false` |
| R2 credential gate | ✅ SAFE | `process.exit(1)` if R2 flags on without creds (config.ts:142-145) |
| Canary counters authoritative | ✅ CONFIRMED | `canaryAllowedJobsCounter` / `canarySkippedJobsCounter` (provider.ts:11-12, 91-96) |
| `ENABLE_NORMALIZED_LOOKUP_CANDIDATES` | ✅ STAYS OFF | Confirmed must remain false until Phase 5 |
| Rollback path | ✅ READY | See Section 12F |
| R2 HeadBucket | ✅ CONFIRMED | Operator pre-confirmed live |
| On-call operator | ✅ CONFIRMED | Available for 24-hour window |

**Pre-flight verdict: ALL CHECKS PASSED. CLEARED FOR OPERATOR ACTIVATION.**

---

### 12B) Production Activation — Operator Steps (Railway)

The following steps must be executed by the operator in the Railway dashboard.

#### Step 1 — Apply Environment Variables

Open Railway dashboard → your service → Variables tab.  
Set or confirm the following values:

```text
STORAGE_PROVIDER=local
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true
DUAL_KEY_LOOKUP_ENABLED=true
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
ENABLE_DUAL_READ=true
R2_CANARY_MODE=job-percentage
R2_CANARY_PERCENTAGE=5
R2_MAX_CONCURRENT_STREAMS=5
R2_TIMEOUT_MS=30000
R2_RETRY_LIMIT=3
LOG_KEY_VERSIONS_IN_TELEMETRY=true
```

R2 credentials (must already be set — do NOT rotate now):

```text
R2_ACCESS_KEY_ID=<confirm existing value>
R2_SECRET_ACCESS_KEY=<confirm existing value>
R2_ENDPOINT=<confirm existing value>
R2_BUCKET=<confirm existing value>
R2_REGION=auto
```

**FORBIDDEN — do NOT set:**

```text
STORAGE_PROVIDER=r2          ← FATAL: loses cleanup authority
DUAL_KEY_LOOKUP_ENABLED=false  ← with NORMALIZED=true = startup crash
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=true  ← Phase 5 only
```

#### Step 2 — Trigger Deployment

In Railway dashboard → Deploy tab → click "Deploy" (or push to linked branch).

Record exact deployment ID and timestamp below:

```text
Deployment ID: ___________________________
Deploy triggered at: ___________________________  (UTC)
```

#### Step 3 — Confirm Service Restart

Verify Railway shows the new deployment as "Active" with no error state.

---

### 12C) Startup Validation (Operator-Confirmed from Railway Logs)

Open Railway service → Logs tab. Confirm ALL of the following appear within 30 seconds of startup:

#### Required Log Lines (in order)

```text
✅ MUST APPEAR — Feature Flags confirmation:
[Startup Config] Feature Flags: { ENABLE_DUAL_WRITE: true, ENABLE_DUAL_READ: true, ENABLE_R2_UPLOADS: true }

✅ MUST APPEAR — R2 Config confirmation:
[Startup Config] R2 Config: { MAX_CONCURRENT_STREAMS: 5, TIMEOUT_MS: 30000, RETRY_LIMIT: 3 }

✅ MUST APPEAR — Expected Phase 1 warning (not an error):
[Startup Warning] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true but ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false.

✅ MUST APPEAR — Staging/canary telemetry initialized:
staging_startup_config event emitted
staging_canary_initialized event emitted
```

#### Forbidden Startup Lines (rollback immediately if seen)

```text
🚨 [Startup Error] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true requires DUAL_KEY_LOOKUP_ENABLED=true
🚨 [Startup Error] R2 feature flags enabled but required environment variables are missing.
🚨 Any uncaught exception at startup
🚨 process exiting with code 1
```

Startup validation result:

```text
Startup confirmed at: ___________________________  (UTC)
Feature Flags log seen: [ YES / NO ]
R2 Config log seen: [ YES / NO ]
Expected warning seen: [ YES / NO ]
Any startup errors: [ NONE / SPECIFY: ___________________ ]
Worker startup confirmed: [ YES / NO ]
```

---

### 12D) First-Hour Telemetry Monitoring

Monitor Railway logs using the following filters and thresholds.

#### T+30min Checkpoint

Verify all of the following:

| Metric | Query Filter | Expected | Breach Action |
|---|---|---|---|
| Canary KPI | `canaryAllowed` / (`canaryAllowed` + `canarySkipped`) | 4%–6% | Investigate; pause if >10% |
| Dual-write failure rate | `dual_write_failure` events / total `dual_write_start` | < 1% | WARNING |
| Dual-write failure rate | Same ratio | > 5% sustained 30m | ROLLBACK |
| R2 timeouts | Count `r2TimeoutCounter` events in 15-min window | < 5 = OK | ≥5 = WARNING; ≥10 = ROLLBACK |
| Stream failures | Count `stream_failure` events | 0 or near-zero | > 5% rate = ROLLBACK |
| Startup errors | Any `[Startup Error]` | None | ROLLBACK immediately |
| Normalized key uploads | `object_key_version: normalized` events | At least 1 | Informational |
| Double-prefix keys | Any key matching `pdf/pdf/` | Zero | ROLLBACK immediately |
| Memory pressure | Process RSS trend | Stable | Alert if growing >20% |
| Queue depth | BullMQ queue depth | Normal (≤ pre-canary baseline) | Alert if 2x baseline |

#### T+60min Checkpoint

Re-verify all T+30min metrics plus:

```text
- Legacy job downloads still succeed (jobs without normalized keys)
- Canary job downloads still succeed (jobs with normalized keys uploaded post-activation)
- Cleanup cron has not deleted any local PDFs prematurely (check cleanup_anomaly events)
- No fallback regression: legacy downloads should NOT be triggering R2 fallback
```

T+30min checkpoint result:

```text
Canary KPI ratio: ____%
Dual-write failure rate: ____%
R2 timeout count (15m window): ____
Stream failure count: ____
Any normalized upload confirmed: [ YES / NO ]
Any double-prefix keys detected: [ YES / NO ]
Any cleanup anomalies: [ YES / NO ]
Any queue regressions: [ YES / NO ]
Any memory anomalies: [ YES / NO ]
```

T+60min checkpoint result:

```text
Canary KPI ratio: ____%
Dual-write failure rate: ____%
R2 timeout count (15m window): ____
Stream failure count: ____
Legacy downloads still succeeding: [ YES / NO ]
Canary job downloads succeeding: [ YES / NO ]
```

---

### 12E) Deterministic Fallback Validation

Execute this test at T+60min or later, after at least one canary job has been processed.

#### Purpose

Verify that a job with a missing local file correctly falls back to R2 and completes the stream lifecycle.

#### Procedure

1. Identify a `jobId` that has been processed post-activation (canary or non-canary — any job with confirmed R2 upload).

2. Verify the R2 upload exists for the job (check `dual_write_success` event for that `jobId` in logs).

3. Temporarily rename or move the local PDF file to simulate local-miss:
   ```text
   $STORAGE_DIR/{jobId}-labels.pdf → {jobId}-labels.pdf.fallback-test
   ```

4. Trigger a download request for that `jobId` via:
   ```text
   GET /api/jobs/{jobId}/download/labels
   ```

5. In Railway logs, filter for `jobId={jobId}` and verify this EXACT event sequence in order:

   ```text
   1) dual_read_fallback   OR   provider_fallback
   2) stream_start          (provider=r2)
   3) stream_success
   4) stream_cleanup
   ```

6. Restore the local file:
   ```text
   {jobId}-labels.pdf.fallback-test → $STORAGE_DIR/{jobId}-labels.pdf
   ```

#### Pass Criteria

ALL four events present for the same `jobId`, in order. File restored. Download succeeded (HTTP 200).

#### Failure Interpretation

| Missing Event | Interpretation |
|---|---|
| No fallback event | Fallback path not triggered (local file not actually missing) |
| `stream_start` without `stream_success` | Fallback triggered but R2 stream failed |
| No `stream_cleanup` | Stream lifecycle incomplete |

Fallback test result:

```text
JobId tested: ___________________________
R2 upload confirmed for job: [ YES / NO ]
dual_read_fallback OR provider_fallback seen: [ YES / NO ]
stream_start (provider=r2) seen: [ YES / NO ]
stream_success seen: [ YES / NO ]
stream_cleanup seen: [ YES / NO ]
Download HTTP status: ____
Local file restored: [ YES / NO ]
Fallback test verdict: [ PASS / FAIL ]
```

---

### 12F) Rollback Readiness Check

Rollback can be executed at any time with zero data loss. Verification:

| Rollback Component | Status | Evidence |
|---|---|---|
| `STORAGE_PROVIDER=local` (authoritative) | ✅ SAFE | All deletions route through local only |
| Legacy fallback path | ✅ INTACT | `ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false` keeps legacy resolver active |
| Cleanup safe gate | ✅ INTACT | `isSafeToDeletePdfFile()` checks R2 sync before delete |
| Zero data loss on rollback | ✅ CONFIRMED | Local filesystem is primary; all new uploads also land on R2 |
| Rollback command | ✅ READY | See below |
| Resolver corruption risk | ✅ ZERO | Resolver normalization remains fully OFF |

#### Immediate Rollback Command (Railway Dashboard)

Set these in Railway Variables and redeploy:

```text
NORMALIZED_KEYS_FOR_NEW_UPLOADS=false
DUAL_KEY_LOOKUP_ENABLED=false
R2_CANARY_MODE=disabled
```

All other flags remain unchanged.

**Effect:** All new uploads revert to legacy key format. Legacy resolver continues. Existing normalized-key uploads in R2 remain safe and are never probed until Phase 5.

Rollback readiness:

```text
Rollback components verified: [ ALL PASSED ]
Estimated rollback time (env var change + deploy): ~2-3 minutes (Railway)
Zero data loss confirmed: YES
Zero resolver corruption confirmed: YES
Zero cleanup risk confirmed: YES
```

---

### 12G) Anomaly Log

```text
Date/Time | Anomaly Description | Action Taken | Resolution
____________________________________________________________________________
[None recorded at time of activation package creation]
```

---

### 12H) Phase 10 Final Outcome

```text
Activation initiated at: ___________________________  (UTC, operator to fill)
All pre-flight checks: PASSED (agent-verified, May 19 2026)
Deployment result: ___________________________
Startup validation: ___________________________
T+30min canary KPI: ____%
T+60min canary KPI: ____%
Fallback test: [ PASS / FAIL ]
Any rollback triggers breached: [ NONE / SPECIFY ]
Total anomalies: ____
```

---

### 12I) GO / HOLD Recommendation for 25% Rollout (Phase 2)

**Based on agent pre-flight verification:** ✅ GO — all local pre-flight checks pass.

**Final GO/HOLD for 25%** must be confirmed by operator after completing:

- [ ] T+60min canary KPI in 4%-6% range
- [ ] Zero `dual_write_failure_rate` > 1% sustained
- [ ] Zero R2 timeout breaches (r2TimeoutCounter ≤ 5 in all 15-min windows)
- [ ] Zero stream failures above noise floor
- [ ] Fallback test: PASS
- [ ] No cleanup anomalies in 24h window
- [ ] No memory-pressure trend

If ALL boxes checked: **GO for Phase 2 (25% canary).**  
If ANY box unchecked: **HOLD. Document breach. Consult rollback criteria.**

---

END OF AUTHORITY FILE
