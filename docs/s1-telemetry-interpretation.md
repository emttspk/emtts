# Stage S1: Telemetry Event Reference

## Telemetry Event Types

This guide explains all telemetry events emitted during S1 staging operations.

### Startup Events

#### `staging_startup_config`

**When:** API startup, after infrastructure validation

**Purpose:** Captures initial S1 configuration state

**Example:**
```json
{
  "timestamp": "2026-05-13T10:00:00.000Z",
  "event": "staging_startup_config",
  "stagingEnabled": true,
  "canaryMode": "job-percentage",
  "canaryPercentage": 5,
  "dualWriteEnabled": true,
  "r2UploadsEnabled": true,
  "credentialsConfigured": true,
  "bucketConfigured": true
}
```

**Interpretation:**
- `stagingEnabled`: Is STAGING_R2_ENABLED=true?
- `canaryMode`: One of "disabled", "job-percentage", "job-count"
- `dualWriteEnabled`: Is ENABLE_DUAL_WRITE=true?
- `r2UploadsEnabled`: Is ENABLE_R2_UPLOADS=true?
- `credentialsConfigured`: Are R2 credentials available?
- `bucketConfigured`: Is R2_BUCKET set?

**Implications:**
- If `stagingEnabled=false`: S1 is inactive (zero overhead)
- If `canaryMode=disabled`: All jobs will dual-write
- If `canaryMode=job-percentage`: Check `canaryPercentage` for limit

---

### Canary Events

#### `dual_write_canary_skip`

**When:** Job is gated by canary mode (not allowed to dual-write)

**Purpose:** Track canary effectiveness in limiting blast radius

**Example:**
```json
{
  "timestamp": "2026-05-13T10:05:30.120Z",
  "event": "dual_write_canary_skip",
  "jobId": "job-5f2a",
  "reason": "job-percentage",
  "canaryPercentage": 5,
  "randomValue": 42,
  "sessionJobsAllowed": 7
}
```

**Interpretation:**
- `reason`: Why was job skipped? Options: "job-percentage", "job-count"
- `randomValue`: Random value (0-100) that exceeded limit
- `sessionJobsAllowed`: How many jobs allowed to dual-write in session so far

**Implications:**
- Job completes locally (no R2 upload attempted)
- Canary is working as intended (limiting blast radius)
- If too many skips: Canary percentage too low

---

#### `dual_write_canary_allowed`

**When:** Job passes canary mode and is allowed to dual-write

**Purpose:** Track canary-allowed jobs for verification

**Example:**
```json
{
  "timestamp": "2026-05-13T10:05:31.450Z",
  "event": "dual_write_canary_allowed",
  "jobId": "job-5f2b",
  "reason": "job-percentage",
  "canaryPercentage": 5,
  "randomValue": 3,
  "sessionJobsAllowed": 8
}
```

**Interpretation:**
- `reason`: How was job allowed? Options: "job-percentage", "job-count"
- `randomValue`: Random value that passed limit
- `sessionJobsAllowed`: Running count of allowed jobs in session

**Implications:**
- Job will dual-write to R2 (async, non-blocking)
- Next event: Either `dual_write_start` or `dual_write_stream_start`

---

### Dual-Write Events

#### `dual_write_start`

**When:** Job local write completes, R2 upload begins

**Purpose:** Mark transition from local write to async R2 upload

**Example:**
```json
{
  "timestamp": "2026-05-13T10:05:31.500Z",
  "event": "dual_write_start",
  "jobId": "job-5f2b",
  "artifactType": "labels_pdf",
  "localPath": "storage/outputs/job-5f2b-labels.pdf",
  "localFileSize": 245632
}
```

**Interpretation:**
- `artifactType`: What's being uploaded? "labels_pdf", "money_order_pdf", etc.
- `localPath`: Where was file written locally?
- `localFileSize`: How big is the file?

**Implications:**
- Local file definitely exists and was written successfully
- R2 upload about to start (async, fire-and-forget)
- Job completion was NOT blocked by this

---

#### `dual_write_stream_start`

**When:** S3 stream connection opens to R2 bucket

**Purpose:** Track R2 connection lifecycle

**Example:**
```json
{
  "timestamp": "2026-05-13T10:05:31.520Z",
  "event": "dual_write_stream_start",
  "jobId": "job-5f2b",
  "r2Bucket": "labelgen-staging",
  "r2Key": "pdf/job-5f2b-labels.pdf",
  "streamId": "stream-xyz-123"
}
```

**Interpretation:**
- `streamId`: Unique ID for this upload stream
- `r2Key`: Path in R2 bucket where file will be stored

**Implications:**
- Network connection established to R2
- Stream about to upload file contents

---

#### `dual_write_success`

**When:** R2 upload completes successfully

**Purpose:** Track successful dual-writes

**Example:**
```json
{
  "timestamp": "2026-05-13T10:05:33.120Z",
  "event": "dual_write_success",
  "jobId": "job-5f2b",
  "streamId": "stream-xyz-123",
  "bytesUploaded": 245632,
  "latencyMs": 1620,
  "eTag": "\"abc123def456\""
}
```

**Interpretation:**
- `bytesUploaded`: How much data uploaded?
- `latencyMs`: How long did upload take?
- `eTag`: R2 object ETag for verification

**Implications:**
- File now exists in R2 bucket
- Sync marker will be set in database
- Cleanup protection now applies (safe to delete local file if needed)

---

#### `dual_write_failure`

**When:** R2 upload fails (timeout, permission error, network issue)

**Purpose:** Track upload failures for debugging

**Example:**
```json
{
  "timestamp": "2026-05-13T10:05:35.800Z",
  "event": "dual_write_failure",
  "jobId": "job-5f2b",
  "streamId": "stream-xyz-123",
  "errorCode": "RequestTimeout",
  "errorMessage": "Socket timeout after 5000ms",
  "bytesTransferred": 123456,
  "attemptNumber": 1
}
```

**Interpretation:**
- `errorCode`: AWS error code (RequestTimeout, AccessDenied, etc.)
- `bytesTransferred`: How much uploaded before failure?
- `attemptNumber`: How many retries attempted?

**Implications:**
- File NOT synced to R2
- Sync marker NOT set (remains NULL in database)
- Local file protected from cleanup (cleanup will skip because not synced)
- Retry might happen on next cleanup cron

---

#### `dual_write_stream_cleanup`

**When:** R2 upload stream closes (success or failure)

**Purpose:** Track stream lifecycle completion

**Example:**
```json
{
  "timestamp": "2026-05-13T10:05:33.150Z",
  "event": "dual_write_stream_cleanup",
  "jobId": "job-5f2b",
  "streamId": "stream-xyz-123",
  "durationMs": 1630,
  "totalBytesProcessed": 245632,
  "outcome": "success"
}
```

**Interpretation:**
- `outcome`: "success", "failure", or "aborted"
- `durationMs`: Total time stream was open
- `totalBytesProcessed`: Final byte count

**Implications:**
- Stream is now closed (semaphore slot released)
- Another stream can now open if waiting

---

### Connectivity Events

#### `staging_r2_connectivity_check`

**When:** API validates R2 connectivity at startup (Phase 2)

**Purpose:** Verify R2 bucket is reachable before enabling S1

**Example:**
```json
{
  "timestamp": "2026-05-13T10:00:05.000Z",
  "event": "staging_r2_connectivity_check",
  "r2Endpoint": "https://<account-id>.r2.cloudflarestorage.com",
  "r2Bucket": "labelgen-staging",
  "checks": [
    {
      "check": "connectivity",
      "status": "success",
      "message": "Bucket reachable"
    },
    {
      "check": "upload_permission",
      "status": "success",
      "message": "Can write to bucket"
    },
    {
      "check": "download_permission",
      "status": "success",
      "message": "Can read from bucket"
    },
    {
      "check": "presigned_url",
      "status": "success",
      "message": "Can generate signed URLs"
    }
  ],
  "allChecksPassed": true
}
```

**Interpretation:**
- Each check is independent
- `allChecksPassed`: Should be true for startup to succeed
- Missing checks mean validation skipped (not errors)

**Implications:**
- If any check fails: R2 not ready, startup may log warning
- If connectivity check fails: S1 staging should not be enabled

---

### Cleanup Events

#### `staging_cleanup_mode`

**When:** Cleanup cron runs (hourly) with S1 staging enabled

**Purpose:** Track cleanup behavior with dual-write protection

**Example:**
```json
{
  "timestamp": "2026-05-13T11:00:00.000Z",
  "event": "staging_cleanup_mode",
  "stagingEnabled": true,
  "dualWriteEnabled": true,
  "filesEvaluated": 42,
  "filesDeleted": 15,
  "filesSkippedUnsync": 8,
  "filesSkippedActive": 7,
  "filesSkippedYoung": 12,
  "syncMarkerCheckResult": {
    "checkedCount": 8,
    "syncedCount": 8,
    "unsyncedCount": 0
  }
}
```

**Interpretation:**
- `filesEvaluated`: How many old files examined?
- `filesDeleted`: How many actually deleted?
- `filesSkippedUnsync`: How many waiting for R2 sync before delete?
- `filesSkippedActive`: How many still in use by active jobs?
- `filesSkippedYoung`: How many not yet 7 days old?
- `syncMarkerCheckResult`: Verification that sync markers checked before delete

**Implications:**
- High `filesSkippedUnsync`: Some uploads still pending, don't delete those files
- High `filesDeleted`: Good, old files cleaned up
- If unsync files never increase: Uploads completing successfully

---

## Telemetry Analysis Patterns

### Pattern 1: Healthy Dual-Write

```
dual_write_canary_allowed    (job allowed by canary)
    ↓
dual_write_start             (local write done)
    ↓
dual_write_stream_start      (R2 connection opening)
    ↓
dual_write_success           (upload completed in < 5s)
    ↓
dual_write_stream_cleanup    (stream closed)
```

**Health Indicators:**
- All 5 events present in order
- `latencyMs` < 5000ms typically
- `dual_write_success` eTag present (verifies object created)

---

### Pattern 2: Canary Gating Working

```
Event sequence with:
- dual_write_canary_skip events (jobs blocked)
- dual_write_canary_allowed events (jobs allowed)
- Ratio matches canary percentage (e.g., 5% allowed / 95% skipped)
```

**Health Indicators:**
- Skipped jobs = ~95% (if 5% canary)
- Allowed jobs = ~5%
- Skipped jobs should NOT have dual_write_start events
- Allowed jobs should have full dual_write_start → dual_write_success chain

---

### Pattern 3: R2 Connectivity Issue

```
dual_write_start
    ↓
dual_write_stream_start
    ↓
dual_write_failure           (timeout or permission error)
    ↓
dual_write_stream_cleanup
```

**Health Indicators:**
- Multiple failures with same `errorCode`
- `errorMessage` indicates root cause (timeout, auth, etc.)
- No `dual_write_success` events

**Action:**
- Check R2 credentials: Still valid?
- Check R2 endpoint: Network reachable?
- Check bucket permissions: S1 service account has write access?

---

### Pattern 4: Cleanup Protecting Synced Files

```
staging_cleanup_mode event with:
- filesEvaluated: 42
- filesDeleted: 15
- filesSkippedUnsync: 8
- syncMarkerCheckResult.syncedCount: 8
```

**Health Indicators:**
- All 8 unsynced files skipped (not deleted yet)
- Synced files deleted normally
- Sync marker query confirmed all 8 are synced before cleanup

---

## Metrics Dashboard Queries

Use metrics output alongside telemetry for complete picture:

### Query 1: Canary Effectiveness

```
canaryAllowedJobsCounter / (canaryAllowedJobsCounter + canarySkippedJobsCounter)
= Percentage of jobs that dual-wrote
(Expected: 5% if canaryPercentage=5)
```

### Query 2: Dual-Write Success Rate

```
dualWriteSuccessRatioGauge
= (dual_write_success events / dual_write_start events) * 100
(Expected: > 99%)
```

### Query 3: Pending Sync Queue

```
unsyncedArtifactsGauge
= Count of files with labelsPdfSyncedAt IS NULL
(Expected: Stable or decreasing)
```

### Query 4: Active Staging Mode

```
stagingModeActiveGauge
= 1 if STAGING_R2_ENABLED=true, else 0
(Expected: 1 during S1 test)
```

---

## Telemetry Collection Setup

### Option 1: Stdout Logging (Default)

All telemetry events logged to console:
```
{"timestamp": "...", "event": "..."}
```

### Option 2: File Collection

```bash
export TELEMETRY_LOG_FILE=/tmp/s1-telemetry.log
npm run dev:api 2>&1 | grep '{"timestamp"' >> $TELEMETRY_LOG_FILE
```

### Option 3: Analyze Collected Telemetry

```bash
npm run r2:telemetry-summary /tmp/s1-telemetry.log
```

---

## Alerting Rules

### Critical Alerts (Rollback If True)

- `dual_write_failure` rate > 5% (connectivity issue)
- `dual_write_success` latency > 10s sustained (performance issue)
- No `dual_write_start` events for 10+ minutes (staging broken)
- `filesSkippedUnsync` continuously increasing (uploads not completing)

### Warning Alerts (Monitor)

- `dual_write_failure` rate 1-5% (some issues, but manageable)
- `dual_write_success` latency 5-10s (slow uploads, investigate)
- `dualWriteSuccessRatioGauge` < 95% (some failures, but not critical)

### Info Alerts (Informational)

- `dual_write_canary_skip` events flowing (canary working)
- `staging_cleanup_mode` running hourly (cleanup active)
- `stagingModeActiveGauge` = 1 (staging enabled)

## Verified Phase 4 Telemetry

Observed on 2026-05-18:
- `dual_write_start`
- `dual_write_canary_allowed`
- `dual_write_stream_start`
- `r2_upload_latency`
- `dual_write_success`
- `sync_tracking_update`
- `dual_write_stream_cleanup`

Telemetry summary result: 12 events total, 1 dual-write start, 1 success, 0 failures, 1 cleanup.

See [PHASE-4-LIVE-CANARY-FINAL-REPORT.md](PHASE-4-LIVE-CANARY-FINAL-REPORT.md) for the captured log and latency numbers.

---

## References

- [S1 Execution Runbook](s1-execution-runbook.md)
- [S1 Safety Rules](s1-staging-safety-rules.md)
- [R2 Troubleshooting](r2-troubleshooting.md)
