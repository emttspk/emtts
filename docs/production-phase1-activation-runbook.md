# Production Phase 1 Activation Runbook
# Phase 9C Day 6 — 5% Canary (NORMALIZED_KEYS_FOR_NEW_UPLOADS)

**Status:** READY FOR EXECUTION  
**Date Prepared:** May 19, 2026  
**Environment:** PRODUCTION ONLY  
**Phase Scope:** Upload-side normalization only. Resolver gates remain OFF.  
**Blast Radius:** New uploads only. All downloads remain legacy-only.  
**RTO (Rollback):** < 15 minutes  

## 2026-06-01 Controlled Rollout Verification Addendum

- Backup completed and restore verified before this verification pass.
- Prior verified classification: `BACKUP_COMPLETED_READY_FOR_ROLLOUT`.
- Protected-scope identity matched expected local folder, git remote, `main` branch, Railway project `Epost`, and Railway `production` environment.
- Read-only production database verification confirmed migration `20260531123000_add_aggregator_payment_transaction` is already recorded as applied in `_prisma_migrations` and table `AggregatorPaymentTransaction` already exists.
- Decision for this pass: skip migration, do not run `prisma migrate deploy`, and do not perform a Railway deploy from this verification step.
- Local `npm run build` completed successfully.
- Public smoke verification passed for API health, DB health, web root, login page, upload route shell, and aggregator JazzCash result route shell.
- No secrets included in this document update.
- Verification classification: `READY_BUT_NOT_DEPLOYED`.

---

## ⚠️ CRITICAL PRE-READ: STORAGE_PROVIDER REQUIREMENT

### PRIMARY SAFETY REQUIREMENT: STORAGE_PROVIDER Must Equal "local"

**MANDATORY FOR PHASES 1–4:**

```
STORAGE_PROVIDER=local
```

**Why This Matters:**
The cleanup cron (apps/api/src/cron/cleanup.ts) and artifact deletion paths route through the active storage provider. 
Phase 1–4 safety guarantees (non-destructive rollout, safe cleanup, sync-marker enforcement) depend on 
the local filesystem being the authoritative deletion authority. If `STORAGE_PROVIDER=r2`, then:

- ❌ Cleanup operations will call R2 `DeleteObjectCommand` (destructive to R2 bucket)
- ❌ User-initiated file deletions remove R2 objects permanently (irreversible)
- ❌ Sync marker safeguards do not prevent R2 deletions
- ❌ Production rollback cannot recover deleted R2 objects

**NO-GO ACTIVATION BLOCKER:**

If your production environment currently has `STORAGE_PROVIDER=r2`, 
**you must NOT proceed with Phase 1 activation.**

First reset to `STORAGE_PROVIDER=local`, verify cleanup behavior, then proceed.

**Pre-Flight Check:**
```bash
# Run before activation:
echo "Current STORAGE_PROVIDER: ${STORAGE_PROVIDER:-local}"
# Expected: "local" or empty (empty defaults to local)

# If you see "r2":
# ABORT - reset first:
# Set STORAGE_PROVIDER=local in the deployment platform environment manager
# redeploy
# wait for cleanup cycle to complete
# THEN proceed with Phase 1
```

---

## ⚠️ CRITICAL PRE-READ: Flag Dependency Chain
It does **NOT** activate the resolver, change download behavior, or affect existing jobs.

### Startup Validation Constraint (ENFORCED IN CODE)

`apps/api/src/config.ts` startup validation **will call `process.exit(1)`** if:

```
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true
AND
DUAL_KEY_LOOKUP_ENABLED=false
```

Therefore Phase 1 **must** set **both** of the following:

```
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true
DUAL_KEY_LOOKUP_ENABLED=true        ← required by startup guard
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false  ← intentionally OFF (uploads only)
```

Setting `DUAL_KEY_LOOKUP_ENABLED=true` **without** `ENABLE_NORMALIZED_LOOKUP_CANDIDATES=true`
means the resolver emits bypass-telemetry only — no normalized HeadObject probes are sent,
no download behavior changes.

---

## OPERATOR CHECKLIST (PRE-ACTIVATION)

Complete **every item** before proceeding. Initial each row.

```
[ ] 1. npm run build --workspace=@labelgen/api returned exit code 0
[ ] 2. npm run typecheck --workspace=@labelgen/api returned exit code 0
[ ] 3. Staging canary results reviewed (847+ test jobs, 0 errors confirmed)
[ ] 4. R2 bucket reachable from production server (HeadBucket confirmed)
[ ] 5. R2 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) valid
[ ] 6. R2_BUCKET env var populated in production
[ ] 7. NODE_ENV=production set correctly in production env
[ ] 8. Telemetry dashboard accessible and showing live events
[ ] 9. Alert thresholds configured (see production-canary-monitoring.md)
[ ] 10. On-call operator identified and available for 24-hour window
[ ] 11. Rollback procedure reviewed (see production-rollback-drill.md)
[ ] 12. Rollback commands tested in staging (dry-run completed)
[ ] 13. Stakeholder sign-off documented
[ ] 14. Database accessible (prisma connectivity confirmed)
[ ] 15. Redis accessible (queue processing confirmed)
```

---

## PART 1: EXACT ENVIRONMENT VARIABLES

### Phase 1 Production Activation Set

```bash
# === CRITICAL SAFETY REQUIREMENT: Cleanup authority ===
STORAGE_PROVIDER=local                        [MANDATORY - see safety section above]

# === REQUIRED: Phase 1 upload normalization ===
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true

# === REQUIRED: Startup validation gate (must accompany above) ===
DUAL_KEY_LOOKUP_ENABLED=true

# === INTENTIONALLY OFF: Resolver probing not activated yet ===
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

# === REQUIRED: R2 infrastructure flags ===
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
ENABLE_DUAL_READ=true

# === REQUIRED: R2 credentials (already set in production env) ===
R2_ACCESS_KEY_ID=<production_key_id>
R2_SECRET_ACCESS_KEY=<production_secret>
R2_ENDPOINT=<production_r2_endpoint>
R2_BUCKET=<production_bucket_name>
R2_REGION=auto

# === CANARY CONTROL: Limit to 5% of jobs ===
R2_CANARY_MODE=job-percentage
R2_CANARY_PERCENTAGE=5

# === CONCURRENCY (do not change) ===
R2_MAX_CONCURRENT_STREAMS=5
R2_TIMEOUT_MS=30000
R2_RETRY_LIMIT=3

# === TELEMETRY ===
LOG_KEY_VERSIONS_IN_TELEMETRY=true
TELEMETRY_STDOUT_DUPLICATE=true
```

### What Each Flag Does in Phase 1

| Flag | Value | Effect |
|---|---|---|
| `NORMALIZED_KEYS_FOR_NEW_UPLOADS` | `true` | New uploads use `pdf/production/{jobId}/{type}.pdf` |
| `DUAL_KEY_LOOKUP_ENABLED` | `true` | Satisfies startup validation; bypass telemetry emits |
| `ENABLE_NORMALIZED_LOOKUP_CANDIDATES` | `false` | Resolver uses legacy-only (no HeadObject for normalized keys) |
| `STAGING_R2_ENABLED` | `true` | Master R2 gate enabled |
| `ENABLE_DUAL_WRITE` | `true` | Dual-write path active |
| `R2_CANARY_MODE` | `job-percentage` | Only 5% of jobs dual-write |
| `R2_CANARY_PERCENTAGE` | `5` | 5% selection rate |

---

### ⚠️ Important Clarifications on Non-Enforced Flags

**R2_RETRY_LIMIT:** This flag is defined in `apps/api/src/config.ts` but **NOT actively enforced in runtime code.**
- Definition: `R2_RETRY_LIMIT` defaults to `3`
- Actual behavior: Timeouts (R2_TIMEOUT_MS=30000ms) are enforced. Retries are not limited by a retry count.
- Operator action: Setting this flag has **no effect** on upload/download behavior.
- Recommendation: Do not rely on R2_RETRY_LIMIT for production timeout control; use R2_TIMEOUT_MS instead.

**LOG_KEY_VERSIONS_IN_TELEMETRY:** This flag is defined in `apps/api/src/config.ts` but **NOT actively checked in runtime code.**
- Definition: `LOG_KEY_VERSIONS_IN_TELEMETRY` defaults to `true`
- Actual behavior: Key version telemetry is **always logged** regardless of this flag's value.
- Operator action: Setting this flag to `false` will **not** prevent telemetry logging.
- Recommendation: Do not set this flag for telemetry control; it has no effect.

Both flags are currently **observational/unused configuration debt** and should not be relied upon for operational control.

---

### Canonical Canary KPI Interpretation (Authoritative)

For Phase 1 canary isolation, use ONLY this KPI:

```
canaryAllowedJobsCounter / (canaryAllowedJobsCounter + canarySkippedJobsCounter)
```

Expected range: 4%–6% (target 5%).

`object_key_version_logged` is informational only and emitted before canary gating.
Do not use keyVersion distribution as canary-isolation proof.

---

## PART 2: ROLLOUT ORDER

### Step 1 — Deploy to API Process

```bash
# Set environment variables in production platform (Railway, Heroku, etc.)
# Use platform environment manager (dashboard/CI/CD), not one-off shell exports

# Navigate to project root
cd "C:\Users\Nazim\Desktop\P.Post\Label Generator"

# Build (verify clean first)
npm run build --workspace=@labelgen/api

# Expected output:
# > @labelgen/api build
# ... tsc compilation output ...
# (no errors)
```

### Step 2 — Deploy to Worker Process

Worker process also calls `validateStartupConfig()` at startup (apps/api/src/worker.ts).
The same environment variables must be set for the worker process.

```bash
# Verify worker has same env vars set
# Worker startup log must show:
# [Startup Config] Feature Flags: { ENABLE_DUAL_WRITE: true, ENABLE_DUAL_READ: true, ENABLE_R2_UPLOADS: true }
# [Startup Config] R2 Config: { MAX_CONCURRENT_STREAMS: 5, TIMEOUT_MS: 30000, RETRY_LIMIT: 3 }
# AND:
# [Startup Warning] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true but ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false.
#   Downloads may not find normalized keys until this flag is enabled.
# (This warning is EXPECTED and SAFE in Phase 1)
# NOTE: normalized-key flags are validated internally but not printed in Feature Flags summary logs.
```

### Step 3 — Rolling Restart

```bash
# Railway: Deploy triggers rolling restart automatically
# Kubernetes: kubectl rollout restart deployment/api deployment/worker
# PM2: pm2 restart all

# Monitor restart progress
# Expected: all instances restart within 5-10 minutes
```

### Step 4 — Startup Log Verification

Immediately after restart, verify startup logs on both API and Worker:

```
EXPECTED API LOG:
[telemetry sink startup event JSON with event="telemetry_sink_initialized"]
[canary config startup event JSON with event="canary_runtime_configuration"]
[Startup Config] Feature Flags: {
  ENABLE_DUAL_WRITE: true,
  ENABLE_DUAL_READ: true,
  ENABLE_R2_UPLOADS: true
}
[Startup Config] R2 Config: { MAX_CONCURRENT_STREAMS: 5, TIMEOUT_MS: 30000, RETRY_LIMIT: 3 }

EXPECTED WORKER LOG (same as above, plus):
[telemetry sink startup event JSON with event="telemetry_sink_initialized"]
[canary config startup event JSON with event="canary_runtime_configuration", process="worker"]
[Startup Warning] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true but ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false.
  Downloads may not find normalized keys until this flag is enabled.

NOTE:
NORMALIZED_KEYS_FOR_NEW_UPLOADS, DUAL_KEY_LOOKUP_ENABLED, and ENABLE_NORMALIZED_LOOKUP_CANDIDATES
are startup-validated, but not displayed in the Feature Flags summary object.

NOT EXPECTED (ABORT if seen):
[Startup Error] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true requires DUAL_KEY_LOOKUP_ENABLED=true
  → This means DUAL_KEY_LOOKUP_ENABLED was not set. Set it and redeploy.

[Startup Error] R2 feature flags enabled but required environment variables are missing.
  → R2 credentials missing. Check R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
```

### Step 4A — Telemetry Sink Visibility Gate (Phase 10C)

Before proceeding to first-hour monitoring, confirm these events are visible in Railway logs:

```text
event=telemetry_sink_initialized
event=canary_runtime_configuration
```

Acceptable sink states:

```text
sink="stdout"  (telemetry emitted to Railway logs directly)
sink="both"    (telemetry emitted to file and Railway logs)
```

If sink reports `file` only, HOLD and set `TELEMETRY_STDOUT_DUPLICATE=true`.

### Step 5 — Health Check

```bash
# API health endpoint
curl -s https://<your-production-api>/health | jq .

# Expected: HTTP 200
# Expected body includes: { "status": "ok", ... }
```

### Step 6 — First Normalized Upload Verification

After the first job processes, verify a normalized key was written to R2:

```bash
# Check telemetry logs for:
# { "event": "object_key_version_logged", "keyVersion": "normalized", "normalizedKey": "pdf/production/{jobId}/labels.pdf" }

# R2 key verification (AWS CLI compatible with R2):
aws s3api list-objects-v2 \
  --bucket $R2_BUCKET \
  --prefix "pdf/production/" \
  --endpoint-url $R2_ENDPOINT \
  --query 'Contents[].Key' \
  --output json

# Expected: At least one key matching pdf/production/{jobId}/labels.pdf or pdf/production/{jobId}/money-orders.pdf
# NOT expected: pdf/pdf/production/... (double-prefix — would indicate Day 2.5 fix regression)
```

---

## PART 3: VERIFICATION COMMANDS

### Startup Verification

```bash
# 1. Confirm API is running
curl -s -o /dev/null -w "%{http_code}" https://<your-api>/health
# Expected: 200

# 2. Confirm worker is processing
# Check queue dashboard or BullMQ inspector
# Expected: Worker shows as "active", not "failed" or "stalled"

# 3. Confirm feature flags in startup log
grep "Startup Config" /var/log/api/production.log | tail -5
# Expected: Feature flags and R2 config logged

# 4. Confirm no startup errors
grep "Startup Error" /var/log/api/production.log | tail -10
# Expected: No output (no errors)
```

### Upload Path Verification (After First Job)

```bash
# 5. Check for normalized key telemetry events
grep "object_key_version_logged" /var/log/api/production.log | tail -5
# Expected: { "event": "object_key_version_logged", "keyVersion": "normalized" }

# 6. Check for dual-write success
grep "dual_write_success" /var/log/api/production.log | tail -5
# Expected: { "event": "dual_write_success", "objectKey": "pdf/production/..." }

# 7. Verify canary isolation ratio (AUTHORITATIVE KPI)
grep '"event":"dual_write_canary_' /var/log/api/production.log | tail -20
# Compute ratio from dual_write_canary_allowed and dual_write_canary_skip
# Expected: allowed / (allowed + skipped) is 4%-6% (target 5%)

# 7b. keyVersion telemetry sanity check (INFORMATIONAL ONLY)
grep '"event":"object_key_version_logged"' /var/log/api/production.log | tail -5
# Expected: keyVersion events are present; do not use for canary-isolation math

# 8. Verify no double-prefix keys in R2
aws s3api list-objects-v2 \
  --bucket $R2_BUCKET \
  --prefix "pdf/pdf/" \
  --endpoint-url $R2_ENDPOINT \
  --query 'Contents[*].Key'
# Expected: empty (null) — no double-prefix keys
```

### Resolver Verification (Download Path — Legacy Only)

```bash
# 9. Confirm downloads still work
curl -s -o /dev/null -w "%{http_code}" \
  https://<your-api>/<old-job-id>/download/labels
# Expected: 200 (legacy fallback works)

# 10. Verify resolver uses legacy-only (no normalized probes since ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false)
grep "compatibility_lookup_attempt" /var/log/api/production.log | grep '"compatibilityMode":"dual-key"' | wc -l
# Expected: 0 (no dual-key probing in Phase 1)

# 11. Verify bypass telemetry is emitting (expected in Phase 1)
grep "compatibility_lookup_metadata_bypass" /var/log/api/production.log | tail -3
# Expected: Events with metadataBypassReason="activation_flag_disabled" or "missing_job_id"

# 12. Deterministic fallback validation (must prove fallback executed)
# For one known jobId where local file is unavailable, expect sequence:
#   dual_read_fallback OR provider_fallback
#   stream_start (provider=r2)
#   stream_success
#   stream_cleanup
# Success: all events for same jobId
# Failure: missing fallback event OR stream_start without stream_success
```

### Database Sync Marker Verification

```bash
# 13. Confirm sync markers populated for new jobs
# (Replace with actual job ID from Phase 1 upload)
# Prisma query or direct DB:
# SELECT id, labelsPdfSyncedAt, moneyOrderPdfSyncedAt FROM "LabelJob"
#   WHERE "createdAt" > NOW() - INTERVAL '1 hour'
#   ORDER BY "createdAt" DESC LIMIT 10;

# Expected: labelsPdfSyncedAt IS NOT NULL for jobs that completed R2 upload
# Expected: moneyOrderPdfSyncedAt IS NOT NULL (for jobs with money orders)
```

---

## PART 4: TELEMETRY DASHBOARDS TO WATCH

### Priority Dashboards (Monitor Continuously)

| Dashboard | Metric | Normal Range | Alert Threshold |
|---|---|---|---|
| Upload Success | `dual_write_success_total` | Increasing steadily | N/A (use ratio) |
| Upload Failure Rate | `dual_write_failure_total` / total | < 1% | > 5% = ROLLBACK |
| Upload Latency P95 | `r2_upload_latency_ms` p95 | 500ms–1500ms | > 3000ms = WARN |
| Upload Latency P99 | `r2_upload_latency_ms` p99 | 1000ms–3000ms | > 5000ms = WARN |
| Stream Failures | `r2StreamFailures` counter | 0 | > 3/hour = WARN |
| Active R2 Streams | `activeR2StreamsGauge` | 0–3 | = 5 = semaphore saturated |
| R2 Timeouts | `r2TimeoutCounter` | 0 | > 5 in 15m = WARN, > 10 in 15m = ROLLBACK |
| Canary Rate | `canaryAllowedJobsCounter` / total | ~5% | < 1% or > 10% = INVESTIGATE |
| Key Version | `object_key_version_logged` keyVersion | Informational only | Not an isolation KPI |
| Sync Markers | `unsyncedArtifactsGauge` | < 20 | > 100 = INVESTIGATE |

### Log Queries (Phase 1 Window)

```bash
# Upload success rate (last 1 hour)
grep "dual_write_success\|dual_write_failure" /var/log/api/production.log \
  | awk '/dual_write_success/{s++} /dual_write_failure/{f++} END {print "Success:", s, "Failure:", f, "Rate:", s/(s+f)*100"%"}'

# Key version distribution
grep "object_key_version_logged" /var/log/api/production.log \
  | python3 -c "import sys,json; [print(json.loads(l).get('keyVersion')) for l in sys.stdin]" \
  | sort | uniq -c

# R2 latency summary
grep "r2_upload_latency" /var/log/api/production.log \
  | python3 -c "import sys,json; latencies=[json.loads(l).get('latencyMs',0) for l in sys.stdin if 'latencyMs' in l]; print('Count:',len(latencies),'P50:',sorted(latencies)[len(latencies)//2] if latencies else 0,'Max:',max(latencies) if latencies else 0)"

# Resolver mode check
grep "compatibility_lookup_metadata_bypass" /var/log/api/production.log | tail -5
# Expected reason: activation_flag_disabled (normal in Phase 1)
```

---

## PART 5: ROLLBACK COMMANDS

### Immediate Rollback (Any Phase 1 NO-GO Trigger)

```bash
# STEP 1: Update environment variables
# (via platform dashboard — Railway, Heroku, Kubernetes configmap, etc.)
NORMALIZED_KEYS_FOR_NEW_UPLOADS=false
DUAL_KEY_LOOKUP_ENABLED=false
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

# STEP 2: Trigger deployment
# Railway: Deploy from dashboard
# Kubernetes: kubectl set env deployment/api NORMALIZED_KEYS_FOR_NEW_UPLOADS=false
#             kubectl set env deployment/worker NORMALIZED_KEYS_FOR_NEW_UPLOADS=false
#             kubectl rollout restart deployment/api deployment/worker
# PM2: pm2 restart all

# STEP 3: Verify rollback successful
# Watch startup logs — must see:
# [Startup Config] Feature Flags: { ..., ENABLE_DUAL_WRITE: true, ... }
# Must NOT see Startup Error

# STEP 4: Verify legacy behavior restored
curl -s https://<your-api>/<old-job-id>/download/labels
# Expected: 200 OK (legacy downloads still work)

# STEP 5: Verify new uploads use legacy keys
grep "object_key_version_logged" /var/log/api/production.log | tail -3
# Expected: keyVersion = "legacy" for any new uploads after rollback
```

### Estimated Rollback Time

```
Action                          Duration
─────────────────────────────────────────
1. Update env vars              30 sec
2. Trigger deploy               1 min
3. Rolling restart              5–10 min
4. Health check                 1 min
5. Verify startup logs          1 min
6. Verify legacy uploads        1 min
─────────────────────────────────────────
Total:                          ~10–15 min
SLA:                            < 20 min
```

---

## PART 6: NO-GO TRIGGERS

Stop and rollback IMMEDIATELY if any of the following occur:

### Trigger #1: Startup Error in Logs

```
PATTERN: "[Startup Error]" in production logs immediately after deploy
CAUSE: Flag misconfiguration (DUAL_KEY_LOOKUP_ENABLED=false with NORMALIZED_KEYS_FOR_NEW_UPLOADS=true,
       or missing R2 credentials)
ACTION: IMMEDIATE ROLLBACK → check env vars → re-verify → redeploy
```

### Trigger #2: Dual-Write Failure Rate > 5%

```
PATTERN: dual_write_failure_total / (dual_write_success_total + dual_write_failure_total) > 5%
          in any 1-hour window
CAUSE: R2 connectivity issue, credential expiry, bucket access denied, or latency spike
ACTION: IMMEDIATE ROLLBACK → investigate R2 status page → check credentials
```

### Trigger #3: R2 Timeout Bursts (Canonical Policy)

```
WARNING PATTERN: r2TimeoutCounter increments > 5 in any 15-minute window
CRITICAL PATTERN: r2TimeoutCounter increments > 10 in any 15-minute window
                (event: dual_write_failure, error: "dual_write_upload_timeout_30000ms")
CAUSE: R2 latency degradation, network issue, or connection pool exhaustion
ACTION (WARNING): Escalate and prepare rollback
ACTION (CRITICAL): IMMEDIATE ROLLBACK → check R2 endpoint → check network
```

### Trigger #4: Double-Prefix Keys Detected in R2

```
PATTERN: Any R2 key matching pdf/pdf/...
COMMAND: aws s3api list-objects-v2 --bucket $R2_BUCKET --prefix "pdf/pdf/" returns non-empty
CAUSE: writeArtifactWithKey() regression — Day 2.5 fix was reverted
ACTION: IMMEDIATE ROLLBACK → file critical bug → do not re-enable until root cause resolved
```

### Trigger #5: Stream Failure Rate > 5%

```
PATTERN: stream_failure events > 5% of download requests in 1 hour
CAUSE: R2 GetObject failure, connection timeout, or resolver bug
ACTION: IMMEDIATE ROLLBACK → check download logs for root cause
```

### Trigger #6: API Process Crash (exit code non-zero)

```
PATTERN: API or worker process exits during Phase 1 window
         process.exit(1) seen in logs
CAUSE: validateStartupConfig() failed — flag dependency violation
ACTION: IMMEDIATE ROLLBACK → verify all 3 flags set correctly
```

### Trigger #7: 5xx Error Rate Increase > 2%

```
PATTERN: HTTP 5xx responses > 2% of all requests in 1-hour window
CAUSE: Possible cascading failure from R2 operations
ACTION: INVESTIGATE immediately → if upload-related: ROLLBACK
```

---

## PART 7: EXPECTED TELEMETRY EXAMPLES

### Expected: New Job Upload (Phase 1)

All 5 events below should appear in sequence for each canary-selected new job:

```json
{
  "ts": "2026-05-20T10:22:10.000Z",
  "event": "object_key_version_logged",
  "jobId": "abc123",
  "artifactType": "labelsPdf",
  "keyVersion": "normalized",
  "rawKey": "generated/abc123-labels.pdf",
  "normalizedKey": "pdf/production/abc123/labels.pdf"
}

{
  "ts": "2026-05-20T10:22:10.050Z",
  "event": "dual_write_start",
  "artifactType": "labelsPdf",
  "jobId": "abc123",
  "provider": "local",
  "objectKey": "pdf/production/abc123/labels.pdf"
}

{
  "ts": "2026-05-20T10:22:10.100Z",
  "event": "dual_write_stream_start",
  "artifactType": "labelsPdf",
  "jobId": "abc123",
  "provider": "r2",
  "objectKey": "pdf/production/abc123/labels.pdf",
  "activeDualWrites": 1
}

{
  "ts": "2026-05-20T10:22:10.950Z",
  "event": "dual_write_success",
  "artifactType": "labelsPdf",
  "jobId": "abc123",
  "provider": "r2",
  "objectKey": "pdf/production/abc123/labels.pdf",
  "latencyMs": 850
}
```

### Expected: Non-Canary Job (95% of Jobs, Canary Skipped)

```json
{
  "ts": "2026-05-20T10:22:11.000Z",
  "event": "dual_write_canary_skip",
  "reason": "percentage_gate"
}
```

### Expected: Download (Legacy-Only Resolver, Phase 1)

```json
{
  "ts": "2026-05-20T10:30:00.000Z",
  "event": "compatibility_lookup_metadata_bypass",
  "objectKey": "pdf/generated/old123-labels.pdf",
  "objectKeyVersion": "legacy",
  "metadataBypassReason": "activation_flag_disabled",
  "metadataValidationResult": "invalid",
  "compatibilityMode": "legacy-only",
  "lookupAttempt": 1
}
```

### NOT Expected (Abort/Investigate if Seen)

```json
{ "event": "object_key_version_logged", "keyVersion": "legacy" }
// INFORMATIONAL only in Phase 1; not a canary isolation trigger

{ "event": "dual_write_failure", "error": "AccessDenied" }
// ROLLBACK: R2 credentials invalid

{ "error": "dual_write_upload_timeout_30000ms" }
// WARN: R2 latency degraded

{ "event": "compatibility_lookup_attempt", "compatibilityMode": "dual-key" }
// INVESTIGATE: Resolver using dual-key (ENABLE_NORMALIZED_LOOKUP_CANDIDATES should be false in Phase 1)
```

---

## PART 8: SUCCESS CRITERIA

### After 1 Hour

```
[ ] Startup logs: no "[Startup Error]" entries
[ ] Upload success rate: > 95% for canary jobs
[ ] dual_write_failure_total: 0 or < 2
[ ] r2_upload_latency_ms p95: < 2000ms
[ ] r2TimeoutCounter: 0
[ ] First normalized key visible in R2 bucket (pdf/production/{jobId}/...)
[ ] No double-prefix keys in R2 (pdf/pdf/... is empty)
[ ] Legacy downloads working (old job 200 OK)
[ ] canaryAllowedJobsCounter ratio is 4%-6% (authoritative)
[ ] Sync markers populated for completed canary jobs
```

### After 6 Hours

```
[ ] All 1-hour criteria sustained
[ ] dual_write_failure_rate: < 1%
[ ] r2_upload_latency_ms p99: < 3000ms
[ ] activeR2StreamsGauge: never > 4 simultaneously
[ ] unsyncedArtifactsGauge: trending down (not accumulating)
[ ] canaryAllowedJobsCounter: ~5% of total jobs
[ ] No anomalous log patterns detected
[ ] No on-call alerts triggered
```

### After 24 Hours

```
[ ] All 1-hour and 6-hour criteria sustained
[ ] dual_write_failure_rate: < 0.5%
[ ] r2_upload_latency_ms p95: stable (not increasing over time)
[ ] Total normalized keys in R2: matches expected canary volume
[ ] Cleanup cron: ran without errors (check cleanup log)
[ ] Old jobs: continue to download via legacy fallback (200 OK)
[ ] Phase 1 considered COMPLETE
[ ] Decision: Proceed to Phase 2 (25%) or hold for investigation
```

---

## PART 9: ESCALATION STEPS

### Level 1: Warning (Self-Investigate)

Conditions: r2TimeoutCounter > 5 in 15m, latency p95 > 2500ms, single upload failure

```
1. Check R2 status page for outages
2. Check network connectivity from production server to R2 endpoint
3. Check current semaphore state (activeR2StreamsGauge)
4. Monitor for 15 minutes — if resolves: log and continue
5. If persists: escalate to Level 2
```

### Level 2: Alert (On-Call Operator)

Conditions: failure rate > 2%, timeout count > 10 in 15m, latency p99 > 5000ms

```
1. Operator reviews telemetry immediately
2. Checks R2 connectivity
3. Decision: Continue monitoring vs Rollback
4. If rollback: follow PART 5 (Rollback Commands)
5. Document incident (see production-rollback-drill.md for template)
```

### Level 3: Critical (Immediate Rollback)

Conditions: Any NO-GO trigger in PART 6, process crash, 5xx rate > 5%

```
1. Immediate rollback (PART 5)
2. Notify engineering lead
3. Post-mortem required (document all log evidence)
4. DO NOT re-enable until root cause fully understood
5. Phase 2+ schedule deferred until root cause resolved
```

---

## PART 10: PHASE PROGRESSION GATE

At the end of Day 5 (24-hour window), operator must evaluate:

```
PROCEED TO PHASE 2 (25%) if ALL true:
  [ ] 24-hour success criteria (above) fully met
  [ ] No Level 2 or Level 3 escalations during Phase 1
  [ ] dual_write_failure_rate < 0.5% sustained
  [ ] R2 latency stable and within thresholds
  [ ] On-call operator confirms: "PHASE 1 PASS"

HOLD / ROLLBACK if ANY true:
  [ ] Any NO-GO trigger fired during Phase 1
  [ ] dual_write_failure_rate > 1% sustained
  [ ] R2 latency degrading (trending upward)
  [ ] Canary ratio outside 4%-6% for sustained windows
  [ ] On-call operator flags concern
```

---

**Runbook Version:** 1.0.0  
**Prepared:** May 19, 2026  
**Applies To:** Phase 9C Day 5 — Production 5% Canary Activation  
**Next Phase Runbook:** (Phase 2, 25% — to be created after Phase 1 passes)  
