# Stage S1: Staging Safety Rules

## Core Safety Properties

These properties MUST ALWAYS be maintained during S1 staging.

### 1. Local-First Authority

```
ALWAYS: STORAGE_PROVIDER = "local"
ALWAYS: Local write completes first
ALWAYS: Local file is authoritative master
ALWAYS: Job completion never waits for R2
```

**Why:** If R2 fails, local file still exists. If local write fails, job fails immediately.

**Violation:** Any code that enables reads from R2 before checking local file first.

**Verify:**
```bash
# config.ts
echo "STORAGE_PROVIDER: $(grep STORAGE_PROVIDER apps/api/src/config.ts)"
# Expected: Always "local"
```

---

### 2. Async Non-Blocking R2 Uploads

```
ALWAYS: R2 upload runs in background (async)
ALWAYS: R2 upload does NOT block job completion
ALWAYS: Job returns immediately after local write
ALWAYS: Caller never waits for R2 status
```

**Why:** User needs result immediately; R2 is just a mirror.

**Violation:** Any code that awaits R2 upload before returning job result.

**Verify:**
```bash
# provider.ts writeArtifactWithDualUpload()
# Look for: return before R2 upload completes
# Should see: fire-and-forget pattern with .catch() error handler
```

---

### 3. Dual-Write Gating with Canary

```
ALWAYS: If R2_CANARY_MODE != "disabled": Check canary gate
ALWAYS: Canary gate = random check OR job-count limit
ALWAYS: Canary gate PREVENTS async R2 upload (not just logs)
ALWAYS: Canary skip emits telemetry (tracked in metrics)
```

**Why:** Blast radius control. If R2 has issues, canary prevents 100% job failure.

**Violation:** Canary checks are logged but uploads still happen.

**Verify:**
```bash
npm run r2:canary-check
# Expected: Canary mode configured, skipped jobs tracked
```

---

### 4. Cleanup Sync Protection

```
ALWAYS: Before delete: Check if labelsPdfSyncedAt IS NOT NULL
ALWAYS: If synced to R2: Safe to delete (mirror exists)
ALWAYS: If NOT synced (NULL): DO NOT DELETE (no mirror backup)
ALWAYS: Young files (< 7 days): DO NOT DELETE regardless
ALWAYS: Active jobs: DO NOT DELETE regardless
```

**Why:** Don't delete local file until verified mirrored to R2.

**Violation:** Cleanup deletes file even though labelsPdfSyncedAt IS NULL.

**Verify:**
```bash
# Check cleanup logic in worker.ts
grep -A 20 "labelsPdfSyncedAt" apps/worker/src/cleanup.ts
# Expected: Only delete if syncedAt !== null
```

---

### 5. No Global Dual-Read Enabling

```
ALWAYS: ENABLE_DUAL_READ NOT enabled during S1
ALWAYS: S1 uses local-only reads
ALWAYS: S2 (future stage) will introduce dual-read fallback
ALWAYS: If ENABLE_DUAL_READ somehow enabled: ROLLBACK IMMEDIATELY
```

**Why:** S1 is write mirroring only. Read fallback adds complexity for later stage.

**Violation:** ENABLE_DUAL_READ=true during S1 staging.

**Verify:**
```bash
# Check startup logs - should NOT see:
# "[S1 STAGING] Dual-read: enabled"
```

---

### 6. Instant Rollback Capability

```
ALWAYS: Disable STAGING_R2_ENABLED = ALL S1 behavior stops
ALWAYS: No schema changes = Can re-enable later without risk
ALWAYS: No data migration = No cleanup required to rollback
ALWAYS: Rollback restart time < 30 seconds
```

**Why:** Safety net if S1 validates badly.

**Violation:** Rollback requires manual cleanup or data migration.

**Verify:**
```bash
npm run r2:rollback-check
# Expected: All checks pass, rollback instant
```

---

### 7. Semaphore Concurrency Limiting

```
ALWAYS: Max 5 concurrent R2 upload streams
ALWAYS: If 5 streams active: New jobs queue until slot available
ALWAYS: Queueing is automatic (Semaphore pattern)
ALWAYS: No manual concurrency management in code
```

**Why:** Prevent overwhelming R2 or local network with simultaneous large uploads.

**Violation:** More than 5 concurrent streams detected; or semaphore not enforced.

**Verify:**
```bash
# During load test, check metrics
# activeR2StreamsGauge should never exceed 5
grep activeR2StreamsGauge logs/metrics.log | max
# Expected: 5
```

---

### 8. Credentials Isolation

```
ALWAYS: R2 credentials stored in .env, never in code
ALWAYS: R2 credentials different from production (staging only)
ALWAYS: Credentials expire/rotate without code changes
ALWAYS: .env.example does NOT include real credentials
```

**Why:** Security - staging credentials compromise != production compromise.

**Violation:** Real R2 credentials in .env.example or git history.

**Verify:**
```bash
git log --all -S "R2_ACCESS_KEY_ID=" -- .env.example
# Expected: No results (credentials never in git)
```

---

### 9. Database Sync Markers

```
ALWAYS: Sync marker set AFTER R2 upload succeeds
ALWAYS: Sync marker = labelsPdfSyncedAt timestamp
ALWAYS: Sync marker NULL until R2 confirms success (eTag received)
ALWAYS: Sync marker checked before cleanup delete
```

**Why:** Durability verification. If DB is source of truth, sync marker proves mirror is safe.

**Violation:** Sync marker set before R2 confirms, or not checked during cleanup.

**Verify:**
```bash
# Check database after successful dual-write
psql $DATABASE_URL -c "SELECT id, labelsPdfSyncedAt FROM labelJob LIMIT 1"
# Expected: labelsPdfSyncedAt = recent timestamp (not NULL)
```

---

### 10. Telemetry Capture

```
ALWAYS: All S1 events emitted to telemetry system
ALWAYS: Telemetry captures: canary gates, uploads, failures, cleanups
ALWAYS: Telemetry NEVER filtered or sampled
ALWAYS: Telemetry analysis informs go/no-go decisions
```

**Why:** Observability. Without telemetry, can't diagnose S1 issues.

**Violation:** Telemetry events missing; or events filtered by sample rate.

**Verify:**
```bash
npm run r2:telemetry-summary $TELEMETRY_LOG_FILE
# Expected: Comprehensive event count and success metrics
```

---

## Development Constraints

### Constraint 1: No STORAGE_PROVIDER Switching

**Rule:** Code MUST NOT change STORAGE_PROVIDER at runtime

**Why:** Switching provider mid-request could break consistency

**Valid:**
```typescript
// ✓ Config-driven at startup
const provider = process.env.STORAGE_PROVIDER || "local"; // Always "local" for S1
```

**Invalid:**
```typescript
// ✗ Runtime switching
if (useR2Backup) {
  STORAGE_PROVIDER = "r2"; // DON'T DO THIS
}
```

---

### Constraint 2: No Blocking R2 Calls

**Rule:** No `await` on R2 upload in critical path

**Why:** Critical path = job completion endpoint; must return immediately

**Valid:**
```typescript
// ✓ Fire and forget
writeArtifactWithDualUpload(jobId, pdf).catch((err) => {
  logger.error("R2 upload failed", err); // Logged but doesn't block
});
// Function returns immediately, caller doesn't wait
```

**Invalid:**
```typescript
// ✗ Blocking
await writeArtifactWithDualUpload(jobId, pdf); // Don't await in request handler
res.json({ status: "completed" });
```

---

### Constraint 3: Canary Must Be Checked BEFORE Upload

**Rule:** Canary check before initiating R2 upload stream

**Why:** If check is after upload starts, it's too late to prevent

**Valid:**
```typescript
// ✓ Check before upload
if (!shouldDualWriteThisJob()) {
  logCanarySkipped(jobId);
  return; // Don't even open stream
}

// Only get here if canary allows
writeToR2Async(jobId, pdf);
```

**Invalid:**
```typescript
// ✗ Check after upload starts
writeToR2Async(jobId, pdf);
if (!shouldDualWriteThisJob()) {
  logCanarySkipped(jobId); // Too late, stream already opened
}
```

---

### Constraint 4: Cleanup Requires Dual Checks

**Rule:** Cleanup must check both sync marker AND job active status

**Why:** Sync marker alone isn't enough - what if job queued for retry?

**Valid:**
```typescript
// ✓ Check both conditions
if (isSyncedToR2(file) && !isJobActive(jobId) && isOlderThan7Days(file)) {
  deleteFile(file);
}
```

**Invalid:**
```typescript
// ✗ Only check sync marker
if (isSyncedToR2(file)) {
  deleteFile(file); // What if job is being retried?
}
```

---

### Constraint 5: Metrics Must Be Non-Breaking

**Rule:** Adding metrics MUST NOT change application logic or timing

**Why:** Metrics are observability, not behavior

**Valid:**
```typescript
// ✓ Metrics after logic completes
performUpload();
metrics.dualWriteSuccessCounter++; // Doesn't affect upload
```

**Invalid:**
```typescript
// ✗ Metrics in critical path
metrics.startTimer();
performUpload();
const duration = metrics.endTimer(); // If this throws, upload fails
```

---

## Testing Requirements

### Test 1: Canary Mode Limiting

**Scenario:** Enable canary at 5%, run 100 jobs

**Expected:**
- ~5 jobs dual-write
- ~95 jobs skip R2
- Telemetry shows correct ratio
- No jobs blocked (all complete locally)

---

### Test 2: R2 Failure Resilience

**Scenario:** Block R2 endpoint, submit 10 jobs

**Expected:**
- All 10 jobs complete locally
- No dual-write events succeed
- Cleanup respects unsynced files (doesn't delete)
- Can re-enable R2 and re-sync later

---

### Test 3: Sync Marker Verification

**Scenario:** Successful dual-write, verify database

**Expected:**
- labelsPdfSyncedAt set to recent timestamp
- eTag matches R2 object
- Cleanup can delete after 7 days if still synced

---

### Test 4: Instant Rollback

**Scenario:** Disable STAGING_R2_ENABLED, restart

**Expected:**
- < 30 second restart
- New jobs complete locally only
- No R2 access attempted
- Canary checks not run

---

### Test 5: Concurrent Upload Limiting

**Scenario:** Burst 50 jobs at once

**Expected:**
- Max 5 R2 streams active simultaneously
- Others queue behind semaphore
- No stream rejections
- All jobs eventually dual-write (if canary allows)

---

## Monitoring Checklist

### Before S1 Activation

- [ ] STORAGE_PROVIDER confirmed = "local"
- [ ] All R2 flags confirmed = false (baseline)
- [ ] Canary mode configured in env
- [ ] R2 credentials tested with `npm run r2:verify`
- [ ] Database reachable (sync markers can be set)
- [ ] Redis reachable (cleanup cron can run)

### During S1 Activation

- [ ] Startup logs show S1 enabled (banner visible)
- [ ] First job submitted and completes locally
- [ ] Telemetry events flowing to stdout/file
- [ ] R2 bucket receiving upload events
- [ ] Database sync markers being set

### During S1 Soak Test

- [ ] dual_write_success rate > 95%
- [ ] R2 latency stable (p95 < 5s typically)
- [ ] No memory leaks (heap stable over 1 hour)
- [ ] Cleanup runs hourly without errors
- [ ] Sync markers persist correctly
- [ ] Canary ratio matches expected percentage

### Before Rollback Decision

- [ ] Review telemetry summary (npm run r2:telemetry-summary)
- [ ] Verify success rate meets go/no-go criteria (> 95%)
- [ ] Verify rollback path safe (npm run r2:rollback-check)
- [ ] Decide: Continue S1 or rollback to local-only

---

## Failure Scenarios

### Scenario 1: R2 Endpoint Unreachable

**What Happens:**
1. dual_write_start event (local write done)
2. dual_write_stream_start event (connection attempt)
3. dual_write_failure event (connection timeout)
4. Stream closes, job continues

**Jobs Affected:** Only those unlucky enough to dual-write during outage

**Recovery:** R2 comes back online, re-sync on next cleanup cron

**Prevention:** Have canary enabled to limit blast radius

---

### Scenario 2: R2 Credentials Wrong

**What Happens:**
1. Startup validation passes (bucket reachable, but maybe with wrong permissions)
2. First dual-write attempts 
3. dual_write_failure event (access denied)
4. Sync marker NOT set
5. Cleanup skips file (not synced, can't delete)

**Jobs Affected:** All jobs if canary disabled; only canary-allowed if enabled

**Recovery:** Fix credentials, restart, cleanup re-syncs unsynced files

**Prevention:** Run `npm run r2:verify` before enabling S1

---

### Scenario 3: Database Offline

**What Happens:**
1. Dual-write succeeds (R2 upload works)
2. Try to set sync marker: database connection fails
3. Sync marker NOT set
4. Cleanup skips file (no way to know if synced)

**Jobs Affected:** None - job still completes locally

**Recovery:** Bring database back online, manual re-sync of sync markers

**Prevention:** Database must be reachable; test with `npm run infra:check`

---

### Scenario 4: Semaphore Bug (Theoretical)

**What Happens:**
1. More than 5 concurrent streams open
2. Resource exhaustion or R2 rate limiting
3. Uploads timeout or fail

**Jobs Affected:** High concurrency scenarios

**Recovery:** Semaphore implementation correct; not expected in practice

**Prevention:** Test concurrent load; verify activeR2StreamsGauge never > 5

---

## References

- [S1 Execution Runbook](s1-execution-runbook.md)
- [Telemetry Interpretation](s1-telemetry-interpretation.md)
- [Rollback Procedure](s1-execution-runbook.md#rollback-from-s1)
- [Architecture Overview](storage-rollout-architecture.md)
