# Production Canary Monitoring Guide
# Phase 9C — Normalized Upload Key Rollout

**Status:** ACTIVE MONITORING GUIDE  
**Date Prepared:** May 19, 2026  
**Applies To:** Phase 1 (5% canary) through Phase 5 (resolver activation)  
**Source of Truth:** `apps/api/src/metrics.ts`, `apps/api/src/telemetry.ts`, `apps/api/src/storage/provider.ts`  

---

## OVERVIEW

This guide documents all metrics, thresholds, queries, and investigation workflows
for the Phase 9C normalized-upload canary rollout.

All metrics are emitted via:
- Structured JSON telemetry to stdout/log file (see `apps/api/src/telemetry.ts`)
- In-process lightweight registry (`apps/api/src/metrics.ts`)

### Canonical KPI Interpretation (Authoritative)

For Phase 1 canary-isolation decisions, the only authoritative KPI is:

```
canaryAllowedJobsCounter / (canaryAllowedJobsCounter + canarySkippedJobsCounter)
```

Target range: 4%–6% (expected 5%).

`object_key_version_logged` is informational and emitted before canary gating.
Do not use keyVersion distribution as canary-isolation proof.

---

## PART 1: METRICS CATALOG

### 1.1 Upload-Side Metrics

| Metric | Type | Source | Description |
|---|---|---|---|
| `dual_write_success_total` | Counter | `provider.ts` | Count of successful R2 dual-write uploads |
| `dual_write_failure_total` | Counter | `provider.ts` | Count of failed R2 dual-write uploads (all reasons) |
| `r2_upload_latency_ms` | Histogram | `provider.ts` | Upload duration in milliseconds |
| `activeDualWritesGauge` | Gauge | `provider.ts` | Currently in-progress dual-write operations |
| `activeR2StreamsGauge` | Gauge | `routes/jobs.ts` + `provider.ts` | R2 streams holding semaphore slot |
| `r2ConcurrencyLimitHits` | Counter | `provider.ts` | Times semaphore queue was full on arrival |
| `r2TimeoutCounter` | Counter | `provider.ts` | Count of uploads that timed out (30s) |
| `r2FailureCounter` | Counter | `provider.ts` | Count of non-timeout upload failures |
| `unsyncedArtifactsGauge` | Gauge | `provider.ts` | Local files awaiting R2 sync confirmation |
| `dualWriteSuccessRatioGauge` | Gauge | `provider.ts` | Rolling success ratio (0–100) |

### 1.2 Canary Control Metrics

| Metric | Type | Source | Description |
|---|---|---|---|
| `canaryAllowedJobsCounter` | Counter | `provider.ts` | Jobs selected for dual-write by canary mode |
| `canarySkippedJobsCounter` | Counter | `provider.ts` | Jobs excluded from dual-write by canary mode |
| `stagingModeActiveGauge` | Gauge | `metrics.ts` | 1 if staging/R2 mode enabled, 0 otherwise |

### 1.3 Download-Side Metrics (Active from Phase 5)

| Metric | Type | Source | Description |
|---|---|---|---|
| `r2StreamDuration` | Histogram | `routes/jobs.ts` | Download stream duration |
| `r2StreamFailures` | Counter | `routes/jobs.ts` | Count of failed download streams |

### 1.4 Heap / Process Metrics

| Metric | Type | Source | Description |
|---|---|---|---|
| `heapUsageGauge` | Gauge | `metrics.ts` | Node.js heap used (bytes) |

---

## PART 2: TELEMETRY EVENTS CATALOG

### 2.1 Upload Chain Events (New Job)

| Event Name | When Emitted | Key Fields |
|---|---|---|
| `object_key_version_logged` | Upload key computed | `jobId`, `keyVersion`, `normalizedKey`, `rawKey` |
| `dual_write_start` | Upload about to start | `jobId`, `artifactType`, `objectKey`, `provider` |
| `dual_write_stream_start` | Inside semaphore, before PutObject | `jobId`, `objectKey`, `activeDualWrites` |
| `dual_write_success` | PutObjectCommand succeeded | `jobId`, `objectKey`, `latencyMs` |
| `dual_write_failure` | PutObjectCommand failed | `jobId`, `objectKey`, `error` |
| `dual_write_upload_contention` | Semaphore was full on arrival | `jobId`, `objectKey`, `availableSlots` |
| `dual_write_master_gate_blocked` | STAGING_R2_ENABLED=false | `reason`, `objectKey` |
| `dual_write_canary_skip` | Job excluded by canary mode | `reason` |
| `dual_write_canary_allowed` | Job included by canary mode | `reason` |

### 2.2 Download Chain Events (R2 Fallback)

| Event Name | When Emitted | Key Fields |
|---|---|---|
| `stream_start` | Local file missing, starting R2 fallback | `provider`, `jobId` |
| `stream_cleanup` | Stream finalized | `activeStreamsBeforeCleanup` |
| `compatibility_lookup_attempt` | HeadObject probe sent | `objectKey`, `objectKeyVersion`, `lookupAttempt`, `compatibilityMode` |
| `compatibility_lookup_hit` | HeadObject found object | `objectKey`, `objectKeyVersion`, `lookupAttempt` |
| `compatibility_lookup_miss` | HeadObject returned 404 | `objectKey`, `objectKeyVersion`, `error` |
| `compatibility_lookup_metadata_bypass` | Normalized probe skipped | `metadataBypassReason`, `objectKey` |

### 2.3 Startup Events

| Event Name | When Emitted | Key Fields |
|---|---|---|
| `telemetry_sink_initialized` | Process startup before other structured events | `sink`, `telemetryLogFile`, `stdoutDuplicateEnabled`, `environment`, `pid` |
| `canary_runtime_configuration` | Process startup to snapshot live canary config | `enabled`, `mode`, `percentage`, `dualWriteEnabled`, `dualReadEnabled`, `r2UploadsEnabled`, `normalizedKeysEnabled` |
| `staging_startup_config` | Process startup with staging enabled | `stagingEnabled`, `canaryMode`, `dualWriteEnabled` |
| `staging_r2_connectivity_check` | R2 bucket connectivity validated | `connectivity`, `uploadable`, `downloadable`, `allValid` |
| `staging_canary_initialized` | Canary mode configured | `canaryMode`, `percentage` |

### 2.5 Event Name Mapping (Phase 10C Forensic Clarification)

The following names are emitted in runtime telemetry and should be used in Railway log filters:

| Expected Name (operator shorthand) | Actual Runtime Event Name |
|---|---|
| `canary_allowed` | `dual_write_canary_allowed` |
| `canary_skipped` | `dual_write_canary_skip` |
| `compatibility_lookup` | `compatibility_lookup_attempt`, `compatibility_lookup_hit`, `compatibility_lookup_miss`, `compatibility_lookup_metadata_bypass` |

Do not treat shorthand names as canonical telemetry event IDs.

### 2.4 Cleanup Events

| Event Name | When Emitted | Key Fields |
|---|---|---|
| `cleanup_staging_mode` | Cleanup cron runs with R2 enabled | `syncProtectionActive` |

---

## PART 3: EXACT THRESHOLDS

### 3.1 Phase 1 (5% Canary) Thresholds

| Metric | Baseline (Staging) | OK Range | WARNING | CRITICAL |
|---|---|---|---|---|
| `dual_write_failure_rate` | 0% | < 1% | 1%–5% | > 5% |
| `r2_upload_latency_ms` p50 | 750ms | < 1000ms | 1000–2000ms | > 2000ms |
| `r2_upload_latency_ms` p95 | 1100ms | < 2000ms | 2000–3500ms | > 3500ms |
| `r2_upload_latency_ms` p99 | 1600ms | < 3000ms | 3000–5000ms | > 5000ms |
| `r2TimeoutCounter` (per 15 minutes) | 0 | 0–5 | > 5 | > 10 |
| `r2FailureCounter` (per hour) | 0 | 0–2 | 3–5 | > 5 |
| `activeR2StreamsGauge` | 0–2 | 0–3 | = 4 | = 5 (saturated) |
| `unsyncedArtifactsGauge` | 0–5 | 0–20 | 20–100 | > 100 |
| `dualWriteSuccessRatioGauge` | 100% | > 98% | 95%–98% | < 95% |
| `canaryAllowedJobsCounter` ratio | 5% | 4%–6% | 2%–4% or 6%–8% | < 2% or > 10% |
| `r2ConcurrencyLimitHits` (per hour) | 0 | 0–5 | 5–20 | > 20 |

### 3.2 Phase 1 Download-Side Thresholds (Legacy Resolver Only)

| Metric | OK Range | WARNING | CRITICAL |
|---|---|---|---|
| `r2StreamFailures` (per hour) | 0–2 | 3–5 | > 5 |
| `r2StreamDuration` p95 | < 3000ms | 3000–5000ms | > 5000ms |
| HTTP 5xx error rate | < 0.5% | 0.5%–2% | > 2% |
| Legacy download success rate | > 99% | 97%–99% | < 97% |

### 3.3 Phased Threshold Evolution

All failure RATE thresholds remain constant across phases (rate-based, not count-based):

```
Phase 1 (5%):   ~50 jobs/day normalized
  → dual_write_failure_rate threshold: < 1%
  → At 5% canary, 1% failure = 0.5 failed jobs/day (essentially zero)

Phase 2 (25%):  ~250 jobs/day normalized
  → Same rate threshold (<1%) → ~2.5 failed jobs/day still acceptable

Phase 4 (100%): ~2000 jobs/day normalized
  → Same rate threshold (<1%) → ~20 failed jobs/day still acceptable

Conclusion: Monitor failure RATE, not raw count.
```

---

## PART 4: EXPECTED BASELINE VALUES

### 4.1 Staging Canary Validated Baselines (from Phase 9B Day 4)

```
847 jobs processed over 48-72 hours

Upload Metrics:
  dual_write_success_total: 847
  dual_write_failure_total: 0
  r2_upload_latency_ms avg: 750ms
  r2_upload_latency_ms max: ~1200ms
  r2TimeoutCounter: 0
  activeR2StreamsGauge peak: 3

Download Metrics:
  r2StreamFailures: 0
  Legacy fallback success rate: 100%
  
Canary Control:
  canaryAllowedJobsCounter: ~5% per window
  canarySkippedJobsCounter: ~95% per window

Key Version:
  informational only (logged pre-gating)
  not used for canary isolation decisions

Sync Markers:
  labelsPdfSyncedAt populated: 100% of successful uploads
  moneyOrderPdfSyncedAt populated: 100% (where applicable)
```

### 4.2 Production Baseline (Estimated for Phase 1)

```
Expected daily volume: ~1000 jobs/day total
Canary window (5%): ~50 jobs/day normalized

Upload Expectations:
  dual_write_success: ~50/day
  dual_write_failure: 0–1/day (< 1%)
  r2_upload_latency_ms avg: 750–1000ms (production may be slightly higher than staging)
  activeR2StreamsGauge peak: 1–3 (low contention at 5% canary)

Download Expectations (Legacy Only):
  All downloads via legacy resolver (ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false)
  Legacy fallback success rate: should remain > 99%
  No normalized probes expected
```

---

## PART 5: LOG QUERIES

### 5.00 Real Pipeline Trigger vs Preview Trigger (Phase 10D)

Use only real upload pipeline endpoints for dual-write telemetry validation:

| Endpoint | Purpose | Dual-write telemetry expected |
|---|---|---|
| `/api/jobs/upload` | Real upload -> queue -> worker -> PDF generation | YES |
| `/api/upload` | Compatibility alias to real upload flow | YES |
| `/api/jobs/preview/labels` | Preview rendering only | NO |

Preview route intentionally bypasses worker queue and dual-write flow. If operators test only preview, absence of `dual_write_start`, `object_key_version_logged`, and canary events is expected.

### 5.0 Telemetry Sink Visibility Check (Phase 10C Required)

Immediately after startup/redeploy, verify both events are visible in Railway logs:

```text
event=telemetry_sink_initialized
event=canary_runtime_configuration
```

Expected sink value in Railway for Phase 10C:

```text
sink="both"  (when TELEMETRY_LOG_FILE is set)
or
sink="stdout" (when TELEMETRY_LOG_FILE is unset)
```

If `telemetry_sink_initialized` is not visible, telemetry visibility is not validated and rollout must HOLD.

### 5.1 Real-Time Upload Monitoring

```bash
# Stream new upload events (live)
tail -f /var/log/api/production.log | grep -E '"event":"(dual_write_success|dual_write_failure|object_key_version_logged)"'

# Count successes vs failures in last 1 hour (requires log rotation timestamps)
awk -v start="$(date -u -d '1 hour ago' '+%Y-%m-%dT%H')" '
  $0 ~ "\"event\":\"dual_write_success\"" && $0 ~ start {s++}
  $0 ~ "\"event\":\"dual_write_failure\"" && $0 ~ start {f++}
  END {printf "Success: %d | Failure: %d | Rate: %.2f%%\n", s, f, (f/(s+f+0.001))*100}
' /var/log/api/production.log
```

### 5.1A Railway CLI Verified Commands (Phase 10F)

Validated against Railway CLI v4.47.1 behavior:

```bash
# Live logs (streaming by default)
railway logs

# Service-specific logs (service name is case-sensitive in this workspace)
railway logs --service Api

# Recent logs (non-streaming)
railway logs -n 500
railway logs --service Api -n 500

# Environment verification
railway variables
railway variables --service Worker

# Deployment/environment verification
railway status

# Redeploy latest code
railway up
```

Important CLI notes from live validation:

```text
- "railway logs --service api" failed with "Service 'api' not found"
  (use "Api" in this workspace).
- In this CLI version, --tail is an alias for --lines and requires a numeric value.
  Use "railway logs" for streaming.
```

### 5.2 Key Version Distribution (Informational Only)

```bash
# Count normalized vs legacy uploads
grep '"event":"object_key_version_logged"' /var/log/api/production.log \
  | python3 -c "
import sys, json, collections
versions = collections.Counter()
for line in sys.stdin:
    try:
        e = json.loads(line.strip())
        versions[e.get('keyVersion', 'unknown')] += 1
    except:
        pass
for k, v in versions.items():
    total = sum(versions.values())
    print(f'{k}: {v} ({v/total*100:.1f}%)')
"
# Use this for observability only.
# Do not use as canary-isolation KPI.
```

### 5.3 Latency Distribution

```bash
# Compute p50, p95, p99 from telemetry logs
grep '"event":"dual_write_success"' /var/log/api/production.log \
  | python3 -c "
import sys, json
latencies = []
for line in sys.stdin:
    try:
        e = json.loads(line.strip())
        if 'latencyMs' in e:
            latencies.append(e['latencyMs'])
    except:
        pass
latencies.sort()
n = len(latencies)
if n == 0:
    print('No data')
else:
    print(f'Count: {n}')
    print(f'P50: {latencies[n//2]}ms')
    print(f'P95: {latencies[int(n*0.95)]}ms')
    print(f'P99: {latencies[int(n*0.99)]}ms')
    print(f'Max: {latencies[-1]}ms')
"
```

### 5.4 Canary Rate Check

```bash
# Verify canary is selecting ~5% of jobs
grep '"event":"dual_write_canary_' /var/log/api/production.log \
  | python3 -c "
import sys, json, collections
events = collections.Counter()
for line in sys.stdin:
    try:
        e = json.loads(line.strip())
        events[e.get('event', 'unknown')] += 1
    except:
        pass
allowed = events.get('dual_write_canary_allowed', 0)
skipped = events.get('dual_write_canary_skip', 0)
total = allowed + skipped
print(f'Allowed: {allowed} ({allowed/max(total,1)*100:.1f}%)')
print(f'Skipped: {skipped} ({skipped/max(total,1)*100:.1f}%)')
print(f'Expected: ~5% allowed')
"
```

### 5.5 R2 Key Verification

```bash
# List all normalized keys in production bucket
aws s3api list-objects-v2 \
  --bucket "$R2_BUCKET" \
  --prefix "pdf/production/" \
  --endpoint-url "$R2_ENDPOINT" \
  --query 'Contents[].{Key:Key,LastModified:LastModified}' \
  --output table

# Verify no double-prefix keys exist (expected: empty)
aws s3api list-objects-v2 \
  --bucket "$R2_BUCKET" \
  --prefix "pdf/pdf/" \
  --endpoint-url "$R2_ENDPOINT" \
  --query 'Contents[].Key' \
  --output json
# Expected output: null (empty)

# Count objects by prefix
aws s3api list-objects-v2 \
  --bucket "$R2_BUCKET" \
  --endpoint-url "$R2_ENDPOINT" \
  --query 'Contents[].Key' \
  --output json \
  | python3 -c "
import sys, json, collections
keys = json.load(sys.stdin) or []
prefixes = collections.Counter(k.split('/')[:3] and '/'.join(k.split('/')[:3]) for k in keys)
for prefix, count in sorted(prefixes.items()):
    print(f'{prefix}: {count} objects')
"
```

### 5.6 Sync Marker Database Query

```sql
-- Check sync marker population for recent jobs (run against production DB)
SELECT
  id,
  status,
  "createdAt",
  "labelsPdfSyncedAt",
  "moneyOrderPdfSyncedAt",
  CASE
    WHEN "labelsPdfSyncedAt" IS NOT NULL THEN 'synced'
    ELSE 'pending'
  END AS labels_sync_status
FROM "LabelJob"
WHERE "createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY "createdAt" DESC
LIMIT 50;

-- Count unsyced jobs (should be near zero after dual-write completes)
SELECT COUNT(*) AS pending_sync_count
FROM "LabelJob"
WHERE "labelsPdfSyncedAt" IS NULL
  AND "createdAt" > NOW() - INTERVAL '1 hour'
  AND status IN ('COMPLETED', 'SUCCESS');
```

### 5.7 Resolver Mode Verification

```bash
# Confirm resolver is using legacy-only (Phase 1 expected behavior)
grep '"event":"compatibility_lookup_metadata_bypass"' /var/log/api/production.log \
  | python3 -c "
import sys, json, collections
reasons = collections.Counter()
for line in sys.stdin:
    try:
        e = json.loads(line.strip())
        reasons[e.get('metadataBypassReason', 'unknown')] += 1
    except:
        pass
for reason, count in reasons.items():
    print(f'{reason}: {count}')
"
# Expected output (Phase 1):
# activation_flag_disabled: NNN   ← normal (ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false)

# ALERT if you see:
# compatibility_lookup_attempt with compatibilityMode: "dual-key"
# → This would indicate ENABLE_NORMALIZED_LOOKUP_CANDIDATES was accidentally set
```

---

## PART 6: STREAM FAILURE INVESTIGATION FLOW

When `r2StreamFailures` > 0 or `stream_failure` events detected:

### Step 1: Identify the Failing Download Path

```bash
# Find stream failures in logs
grep '"event":"stream_failure"\|r2StreamFailures' /var/log/api/production.log | tail -20

# Check if failures are for new (normalized) or old (legacy) jobs
grep '"event":"stream_failure"' /var/log/api/production.log \
  | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        e = json.loads(line)
        print(f'jobId: {e.get(\"jobId\")}, provider: {e.get(\"provider\")}, error: {e.get(\"error\")}')
    except:
        pass
"
```

### Step 2: Check Preceding Resolver Events

```bash
# For a specific failing jobId:
JOB_ID="abc123"
grep "\"$JOB_ID\"" /var/log/api/production.log | tail -20

# Look for:
# - compatibility_lookup_attempt (resolver tried)
# - compatibility_lookup_miss (key not found in R2)
# - compatibility_lookup_hit (key found in R2 — but stream failed after)
```

### Step 3: Determine Root Cause

```
Root Cause A: compatibility_lookup_miss for BOTH normalized and legacy
→ Key was never uploaded to R2 (local file missing + not synced)
→ Expected for very new jobs (local file still exists → should serve from local)
→ Check: Does local file exist for this job?
→ If local missing too: Bug — job cleanup too aggressive

Root Cause B: compatibility_lookup_hit but stream_failure follows
→ Key exists in R2 but GetObject stream failed
→ Possible: R2 bandwidth issue, network timeout
→ Check: r2_download_latency_ms histogram
→ Check: R2 status page
→ Action: Retry — if persistent, file WARN

Root Cause C: stream_failure rate > 5%
→ Systemic R2 issue or code regression
→ ACTION: ROLLBACK (see production-rollback-drill.md)
```

### Step 4: Resolution Path

```
For Root Cause A:
  - Check local filesystem: ls $STORAGE_DIR/*{jobId}*
  - If local exists: retry download (may have been a race condition)
  - If local missing: check cleanup cron for premature deletion

For Root Cause B:
  - Check R2 status page
  - If temporary: wait and retry
  - If persistent (> 30 min): WARN to on-call
  - If > 5% failure rate: ROLLBACK

For Root Cause C:
  - IMMEDIATE ROLLBACK
  - Check ENABLE_NORMALIZED_LOOKUP_CANDIDATES was accidentally set
  - Check R2 connectivity (HeadBucket)
```

---

## PART 7: DUAL-WRITE FAILURE INVESTIGATION FLOW

When `dual_write_failure_total` > 0 or `dual_write_failure` events detected:

### Step 1: Classify the Error

```bash
# Extract all dual-write failure errors
grep '"event":"dual_write_failure"' /var/log/api/production.log \
  | python3 -c "
import sys, json, collections
errors = collections.Counter()
for line in sys.stdin:
    try:
        e = json.loads(line)
        errors[e.get('error', 'unknown')] += 1
    except:
        pass
for error, count in sorted(errors.items(), key=lambda x: -x[1]):
    print(f'{count}: {error}')
"
```

### Step 2: Error Class Actions

```
Error: "AccessDenied" or "InvalidAccessKeyId"
→ R2 credentials invalid or expired
→ ACTION: Update R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY → redeploy
→ SEVERITY: CRITICAL — ROLLBACK if can't resolve in 15 min

Error: "NoSuchBucket"
→ R2_BUCKET variable incorrect or bucket deleted
→ ACTION: Verify R2_BUCKET matches production bucket name
→ SEVERITY: CRITICAL — ROLLBACK until resolved

Error: "RequestTimeout" or "dual_write_upload_timeout_30000ms"
→ R2 latency exceeding 30-second timeout
→ ACTION: Check R2 status page; wait 15 min; if persists: ROLLBACK
→ SEVERITY: HIGH

Error: "NetworkingError" or "ECONNRESET"
→ Network connectivity to R2 endpoint
→ ACTION: Check server→R2 connectivity; check DNS
→ SEVERITY: HIGH

Error: "EntityTooLarge"
→ PDF file exceeds R2 object size limit
→ ACTION: Investigate large job PDFs; not a systemic issue
→ SEVERITY: LOW (single job)
```

### Step 3: Rate Assessment

```
< 1%: NORMAL (random transient failures, retry handles them)
1%–5%: WARNING → investigate root cause, monitor closely
> 5%: CRITICAL → IMMEDIATE ROLLBACK
```

### Step 4: Confirm via Sync Markers

```sql
-- Check if failed jobs have null sync markers (expected)
SELECT id, "labelsPdfSyncedAt", status
FROM "LabelJob"
WHERE "createdAt" > NOW() - INTERVAL '1 hour'
  AND "labelsPdfSyncedAt" IS NULL
  AND status = 'COMPLETED';
-- These are jobs where dual-write failed but job succeeded locally
-- They are safe (local file exists) but won't be in R2
-- Cleanup will skip them (syncedAt IS NULL → not safe to delete local)
```

---

## PART 8: R2 TIMEOUT INVESTIGATION FLOW

When `r2TimeoutCounter` > 5 in 15 minutes:

### Step 1: Measure Latency Trend

```bash
# Extract latency over time (requires ISO timestamps)
grep '"event":"dual_write_success"' /var/log/api/production.log \
  | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        e = json.loads(line)
        if 'latencyMs' in e:
            print(f'{e[\"ts\"]}: {e[\"latencyMs\"]}ms')
    except:
        pass
" | tail -30

---

## PART 9: PHASE 10G — LIVE ACTIVATION RECORD (May 19, 2026)

### Status: ✅ PHASE 10D GATE PASSED

| Check | Result |
|-------|--------|
| Startup telemetry visible | ✅ |
| `canary_runtime_configuration` with `mode="job-percentage"` | ✅ |
| Embedded worker started (`START_WORKER_IN_API=true`) | ✅ |
| `dual_write_start` emitted for real job | ✅ |
| `object_key_version_logged` with `keyVersion="normalized"` | ✅ |
| Job processed and completed | ✅ |

### Live Startup Log (2026-05-19T01:27:43 UTC)

```
event="telemetry_sink_initialized" sink="stdout" environment="production"
event="canary_runtime_configuration" mode="job-percentage" percentage=5
  r2UploadsEnabled=false normalizedKeysEnabled=true
event="staging_startup_config" stagingEnabled=true r2UploadsEnabled=false
  credentialsConfigured=false bucketConfigured=false
event="canary_runtime_configuration" process="worker"  ← embedded worker confirmed
```

### Live Job Execution Log (job 30f27420, 01:27:46 UTC)

```
event="dual_write_start" artifactType="labelsPdf"
  objectKey="pdf/production/30f27420-.../labels.pdf"
event="object_key_version_logged" keyVersion="normalized"
  normalizedKey="pdf/production/30f27420-.../labels.pdf"
event="object_key_version_logged" keyVersion="normalized"  
  normalizedKey="pdf/production/30f27420-.../money-orders.pdf"
[Worker] Job 30f27420-... completed successfully
```

### Next Phase: R2 Credential Configuration

Once `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` are added and
`ENABLE_R2_UPLOADS=true` is set, monitor for:
- `dual_write_canary_allowed` (5% of jobs)
- `dual_write_canary_skip` (95% of jobs)
- `dual_write_success` (on allowed jobs)


# Look for: Is latency increasing over time? (trend, not just point)
```

### Step 2: Check Semaphore Saturation

```bash
# Look for semaphore contention events
grep '"event":"dual_write_upload_contention"' /var/log/api/production.log | tail -10

# If many contention events:
# → More jobs arriving than 5-stream semaphore can handle
# → Not a timeout issue — it's a queue depth issue
# → Check: Is job throughput higher than expected?
# → Action: Monitor; semaphore naturally throttles; no immediate action
# → If queue depth > 50: consider reducing canary percentage temporarily
```

### Step 3: Check R2 Endpoint

```bash
# Test R2 connectivity directly
time aws s3api head-bucket \
  --bucket "$R2_BUCKET" \
  --endpoint-url "$R2_ENDPOINT" \
  2>&1
# Expected: < 500ms

# If > 2000ms: R2 is degraded → check status page
# Check: https://www.cloudflarestatus.com/ (R2 section)
```

### Step 4: Timeout Action Matrix

```
r2TimeoutCounter 1-5/15m:    WATCH → log and continue
r2TimeoutCounter >5/15m:     WARN → escalate to on-call, prepare rollback
r2TimeoutCounter >10/15m:    CRITICAL → IMMEDIATE ROLLBACK
```

---

## PART 9: PHASE-BY-PHASE MONITORING SUMMARY

### Phase 1 (5%, Days 5–6)

```
Primary Focus: Upload path correctness
Key Metrics: dual_write_failure_rate, canaryAllowedJobsCounter ratio
Expected Volume: ~50 normalized uploads/day
Watch For: Any double-prefix keys in R2
Duration: 24 hours minimum
```

### Phase 2 (25%, Days 6–7)

```
Primary Focus: Volume scaling
Key Metrics: r2_upload_latency_ms (latency stable under 5x load), unsyncedArtifactsGauge
Expected Volume: ~250 normalized uploads/day
Watch For: Semaphore saturation (activeR2StreamsGauge), latency trend
Duration: 24 hours minimum
```

### Phase 3 (50%, Days 7–8)

```
Primary Focus: Mid-scale stability
Key Metrics: dualWriteSuccessRatioGauge (should stay > 98%), r2ConcurrencyLimitHits
Expected Volume: ~500 normalized uploads/day
Watch For: Cleanup cron behavior (does it handle coexistence correctly?)
Duration: 24 hours minimum
```

### Phase 4 (100%, Days 8–9)

```
Primary Focus: Full-volume stability, pre-resolver readiness
Key Metrics: All upload metrics + all download metrics
Expected Volume: ~2000 normalized uploads/day
Watch For: Any latency regression, memory pressure (heapUsageGauge)
Duration: 24 hours minimum before Phase 5
```

### Phase 5 (Resolver, Day 9+)

```
Primary Focus: Download path correctness with dual probing
NEW Key Metrics:
  - compatibility_lookup_hit (normalized) — should increase from Phase 5 start
  - compatibility_lookup_miss (normalized) — should trend to 0 over time (as more jobs have normalized keys)
  - compatibility_lookup_hit (legacy) — should still work for old jobs
  - r2StreamFailures — monitor for download regressions
Expected Behavior:
  - New jobs (normalized uploads from Days 5–9): resolver hits normalized key
  - Old jobs (legacy uploads): resolver misses normalized, hits legacy (fallback)
Watch For: Any old job getting 404 (means resolver fallback broke)
Duration: 48 hours minimum before legacy cleanup planning
```

---

## PART 10: ALERTING CONFIGURATION

### Recommended Alert Rules

#### Alert 1: High Dual-Write Failure Rate

```yaml
name: high_dual_write_failure_rate
condition: >
  (dual_write_failure_total / (dual_write_success_total + dual_write_failure_total)) > 0.05
  over 1h window
severity: CRITICAL
action: PAGE on-call immediately, begin rollback
```

#### Alert 2: R2 Upload Latency P99 High

```yaml
name: r2_upload_latency_p99_high
condition: >
  r2_upload_latency_ms p99 > 5000ms
  over 30-minute window
severity: WARNING
action: Notify on-call, begin investigation
```

#### Alert 3: R2 Timeout Burst

```yaml
name: r2_timeout_burst
condition: >
  r2TimeoutCounter > 10 in any 15-minute window
severity: CRITICAL
action: PAGE on-call immediately
```

#### Alert 4: Semaphore Saturation

```yaml
name: r2_semaphore_saturated
condition: >
  activeR2StreamsGauge == 5 for more than 60 seconds
severity: WARNING
action: Notify on-call, monitor queue depth
```

#### Alert 5: Unsynced Artifacts Accumulating

```yaml
name: unsynced_artifacts_high
condition: >
  unsyncedArtifactsGauge > 100
severity: WARNING
action: Investigate dual-write failure chain
```

#### Alert 6: Unexpected Normalized Probe in Phase 1

```yaml
name: unexpected_normalized_probe_phase1
condition: >
  compatibility_lookup_attempt with compatibilityMode="dual-key" detected
  while ENABLE_NORMALIZED_LOOKUP_CANDIDATES is expected to be false
severity: CRITICAL
action: FLAG immediately — possible config misconfiguration
```

---

**Guide Version:** 1.0.0  
**Prepared:** May 19, 2026  
**Applies To:** Phase 9C Days 5–9 (all phases)  
**Related Docs:** [production-phase1-activation-runbook.md](production-phase1-activation-runbook.md), [production-rollback-drill.md](production-rollback-drill.md)  
