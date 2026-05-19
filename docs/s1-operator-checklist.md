# Stage S1: Operator Checklist

## Pre-S1 Activation Checklist (24 Hours Before)

### Infrastructure Readiness

- [ ] **PostgreSQL 16** reachable on localhost:5432 or DATABASE_URL
  ```bash
  psql $DATABASE_URL -c "SELECT version()"
  ```
  Expected: PostgreSQL 16.x response

- [ ] **Redis 7+** reachable on localhost:6379 or REDIS_URL
  ```bash
  redis-cli -u $REDIS_URL ping
  ```
  Expected: PONG

- [ ] **Prisma migrations** current
  ```bash
  npm run prisma:migrate --workspace=@labelgen/api
  ```
  Expected: "Migrations up to date"

- [ ] **API builds cleanly** with no TypeScript errors
  ```bash
  npm run build --workspace=@labelgen/api
  ```
  Expected: Build succeeds, no errors

- [ ] **Worker builds cleanly** with no TypeScript errors
  ```bash
  npm run build --workspace=@labelgen/worker
  ```
  Expected: Build succeeds, no errors

### R2 Configuration

- [ ] **R2 endpoint** set in .env
  ```bash
  echo $R2_ENDPOINT
  ```
  Expected: https://xxxxx.r2.googleapis.com

- [ ] **R2 bucket** set in .env
  ```bash
  echo $R2_BUCKET
  ```
  Expected: labelgen-staging (or agreed name)

- [ ] **R2 credentials** set in .env
  ```bash
  test -n "$R2_ACCESS_KEY_ID" && echo "✓ Access Key set"
  test -n "$R2_SECRET_ACCESS_KEY" && echo "✓ Secret Key set"
  ```
  Expected: Both set (not shown, for security)

- [ ] **R2 bucket verified** with npm run r2:verify
  ```bash
  npm run r2:verify
  ```
  Expected: All 7 checks pass

- [ ] **.env NOT in git** (no credential exposure)
  ```bash
  git status | grep .env
  ```
  Expected: .env not listed (already in .gitignore)

### S1 Configuration

- [ ] **STAGING_R2_ENABLED** NOT set (disabled by default)
  ```bash
  test -z "$STAGING_R2_ENABLED" && echo "✓ Not set"
  ```
  Expected: Not set (empty = false = safe)

- [ ] **Canary mode** configured in .env
  ```bash
  grep "R2_CANARY_MODE\|R2_CANARY_PERCENTAGE" .env
  ```
  Expected: Set to job-percentage with 5% (or agreed percentage)

- [ ] **Dual-write flag** disabled (will enable during activation)
  ```bash
  test -z "$ENABLE_DUAL_WRITE" && echo "✓ Not set"
  ```
  Expected: Not set

- [ ] **Cleanup cron** enabled (every 1 hour)
  ```bash
  grep -i "cleanup\|cron" apps/worker/src/cleanup.ts | head -3
  ```
  Expected: Cleanup function references found

### Telemetry Setup

- [ ] **Telemetry file path** configured
  ```bash
  export TELEMETRY_LOG_FILE=/var/log/labelgen/s1-telemetry.log
  # Or: /tmp/s1-telemetry.log for testing
  mkdir -p $(dirname $TELEMETRY_LOG_FILE)
  touch $TELEMETRY_LOG_FILE
  ```
  Expected: File created and writable

- [ ] **Log rotation** configured (prevent disk fill)
  ```bash
  # Configure logrotate or similar
  # Or check disk space
  df -h /var/log
  ```
  Expected: Enough disk space for 24 hours of telemetry

### Documentation Review

- [ ] **Runbook read** by operator
  - [ ] [S1 Execution Runbook](s1-execution-runbook.md) reviewed

- [ ] **Safety rules understood** by operator
  - [ ] [S1 Safety Rules](s1-staging-safety-rules.md) reviewed

- [ ] **Telemetry format known** by operator
  - [ ] [Telemetry Interpretation](s1-telemetry-interpretation.md) reviewed

- [ ] **Troubleshooting paths known** by operator
  - [ ] [R2 Troubleshooting](r2-troubleshooting.md) bookmarked

### Rollback Plan

- [ ] **Rollback procedure documented** and understood
  ```bash
  npm run r2:rollback-check
  ```
  Expected: "Rollback path is safe"

- [ ] **Rollback time** estimated (< 30 seconds)

- [ ] **Escalation contacts** identified (Cloudflare, team lead)

---

## S1 Activation Checklist (During Activation)

### Step 1: Enable Staging Master Flag

- [ ] **Set STAGING_R2_ENABLED**
  ```bash
  export STAGING_R2_ENABLED=true
  ```

- [ ] **Set canary mode**
  ```bash
  export R2_CANARY_MODE=job-percentage
  export R2_CANARY_PERCENTAGE=5
  ```

- [ ] **Set dual-write flags**
  ```bash
  export ENABLE_DUAL_WRITE=true
  export ENABLE_R2_UPLOADS=true
  ```

### Step 2: Start API with S1 Configuration

- [ ] **Start API**
  ```bash
  STAGING_R2_ENABLED=true \
  R2_CANARY_MODE=job-percentage \
  R2_CANARY_PERCENTAGE=5 \
  ENABLE_DUAL_WRITE=true \
  ENABLE_R2_UPLOADS=true \
  npm run dev:api
  ```

- [ ] **Verify startup logs** show S1 banner
  ```
  ╔════════════════════════════════════════════════════════════╗
  ║  STAGE S1 STAGING MODE ENABLED                             ║
  ╚════════════════════════════════════════════════════════════╝
  ```

- [ ] **Check startup diagnostics**
  - [ ] [S1 STAGING] Dual-write: enabled
  - [ ] [S1 STAGING] Canary mode: job-percentage
  - [ ] [S1 STAGING] Credentials: configured
  - [ ] [S1 STAGING] Bucket: configured

### Step 3: Start Worker with S1 Configuration

- [ ] **Start worker**
  ```bash
  STAGING_R2_ENABLED=true npm run worker:dev
  ```

- [ ] **Verify worker started** (no errors in logs)

### Step 4: Submit Test Batch

- [ ] **Create small test batch** (5 rows, 1MB PDF expected)

- [ ] **Submit via API**
  ```bash
  curl -X POST http://localhost:3000/api/v1/jobs/upload \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@test-batch.xlsx"
  ```

- [ ] **Note job ID** for reference

### Step 5: Verify Job Completes Locally

- [ ] **Job status** = COMPLETED (should be instant)

- [ ] **Local file** exists
  ```bash
  ls -la storage/outputs/{jobId}-labels.pdf
  ```

- [ ] **Verify file not empty**
  ```bash
  stat storage/outputs/{jobId}-labels.pdf | grep Size
  ```

### Step 6: Monitor Telemetry Events

- [ ] **Watch telemetry** for dual-write events
  ```bash
  tail -f $TELEMETRY_LOG_FILE | grep dual_write
  ```

- [ ] **Expected sequence:**
  1. `dual_write_start`
  2. `dual_write_stream_start`
  3. `dual_write_success`
  4. `dual_write_stream_cleanup`

- [ ] **Timing** < 5 seconds from start to cleanup

### Step 7: Verify R2 Has File

- [ ] **List R2 bucket**
  ```bash
  aws s3 ls s3://labelgen-staging/pdf/ \
    --endpoint-url=$R2_ENDPOINT
  ```

- [ ] **File present** with job ID in name

### Step 8: Verify Database Sync Marker

- [ ] **Check database**
  ```bash
  psql $DATABASE_URL -c \
    "SELECT id, labelsPdfSyncedAt FROM labelJob WHERE id = 'JOB_ID' LIMIT 1"
  ```

- [ ] **labelsPdfSyncedAt** = recent timestamp (not NULL)

### Step 9: Verify Canary Status

- [ ] **Run canary check**
  ```bash
  npm run r2:canary-check
  ```

- [ ] **Expected output:**
  - ✓ Staging enabled
  - ✓ Dual-write enabled
  - ✓ R2 uploads enabled
  - ✓ Canary mode: job-percentage (5% of jobs)

---

## S1 Soak Test Checklist (First 4 Hours)

### Phase 1: Baseline Monitoring (Hours 0-1)

Every 10 minutes:

- [ ] **API still running** (no crashes)
  ```bash
  curl http://localhost:3000/health
  ```
  Expected: 200 OK

- [ ] **Worker still running** (no errors)
  ```bash
  ps aux | grep worker | grep -v grep
  ```
  Expected: Process running

- [ ] **Telemetry flowing**
  ```bash
  tail -5 $TELEMETRY_LOG_FILE
  ```
  Expected: Recent events visible

- [ ] **No memory growth**
  ```bash
  ps aux | grep "node.*dev:api" | awk '{print $6}'
  ```
  Expected: Stable RSS memory

### Phase 2: Load Test (Hours 1-4)

- [ ] **Submit 5 jobs** (small batches)
  ```bash
  for i in {1..5}; do
    curl -X POST http://localhost:3000/api/v1/jobs/upload \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@test-batch.xlsx"
  done
  ```

- [ ] **All jobs complete** within 1 minute each

- [ ] **Telemetry summary**
  ```bash
  npm run r2:telemetry-summary $TELEMETRY_LOG_FILE
  ```
  Expected:
  - ✓ Dual-write successes > 0
  - ✓ Dual-write failures = 0
  - Success rate: 100%

- [ ] **R2 bucket shows files**
  ```bash
  aws s3 ls s3://labelgen-staging/pdf/ --endpoint-url=$R2_ENDPOINT
  ```
  Expected: 5 files present

- [ ] **Database sync markers set**
  ```bash
  psql $DATABASE_URL -c \
    "SELECT COUNT(*) FROM labelJob WHERE labelsPdfSyncedAt IS NOT NULL"
  ```
  Expected: 5 or more

---

## S1 Extended Soak Checklist (24-Hour Test)

### Hourly Checks

Every hour (pick one time, e.g., at :00):

- [ ] **API responsive**
  ```bash
  time curl http://localhost:3000/health
  ```
  Expected: < 100ms response

- [ ] **Worker processing** jobs
  ```bash
  tail -20 logs/worker.log | grep -i "processing\|completed"
  ```
  Expected: Recent job completions

- [ ] **Telemetry flowing**
  ```bash
  tail -1 $TELEMETRY_LOG_FILE
  ```
  Expected: Recent timestamp

- [ ] **Memory stable**
  ```bash
  ps aux | grep "node" | grep -E "dev:api|worker" | awk '{print $6}'
  ```
  Expected: No dramatic growth

### 6-Hour Mark

- [ ] **Cleanup cron ran** (every 1 hour, verify at 6 hours)
  ```bash
  npm run r2:telemetry-summary $TELEMETRY_LOG_FILE | grep staging_cleanup_mode | tail -6
  ```
  Expected: 6 cleanup events

- [ ] **Files cleaned up** (old files deleted)
  ```bash
  psql $DATABASE_URL -c \
    "SELECT COUNT(*) FROM labelJob WHERE labelsPdfDeletedAt IS NOT NULL" | tail -1
  ```
  Expected: Some files marked deleted

### 12-Hour Mark

- [ ] **Telemetry summary** still healthy
  ```bash
  npm run r2:telemetry-summary $TELEMETRY_LOG_FILE
  ```
  Expected:
  - ✓ Total events > 100
  - ✓ Dual-write success rate > 99%
  - ✓ Canary ratio matches expected

- [ ] **R2 bucket** growing (not stuck)
  ```bash
  aws s3 ls s3://labelgen-staging/ --endpoint-url=$R2_ENDPOINT --recursive | wc -l
  ```
  Expected: Growing over time

- [ ] **Database** healthy (queries responsive)
  ```bash
  time psql $DATABASE_URL -c "SELECT COUNT(*) FROM labelJob"
  ```
  Expected: < 1 second response

### 24-Hour Mark

- [ ] **Final telemetry analysis**
  ```bash
  npm run r2:telemetry-summary $TELEMETRY_LOG_FILE
  ```
  Expected:
  - ✓ Dual-write success rate > 95% (minimum)
  - ✓ No errors sustained for > 1 hour
  - ✓ Canary gates working correctly
  - ✓ Sync markers being set

- [ ] **Rollback path verified** (can still roll back)
  ```bash
  npm run r2:rollback-check
  ```
  Expected: ✓ Rollback path is safe

- [ ] **No data loss** (cleanup protected unsynced files)
  ```bash
  psql $DATABASE_URL -c \
    "SELECT COUNT(*) FROM labelJob WHERE labelsPdfSyncedAt IS NULL AND labelsPdfDeletedAt IS NULL" | tail -1
  ```
  Expected: Only recent unsynced files (< 1 hour old)

---

## Go/No-Go Decision Checklist (After 24-Hour Test)

### Go Criteria (All Must Be True)

- [ ] **Dual-write success rate ≥ 95%**
  ```bash
  npm run r2:telemetry-summary $TELEMETRY_LOG_FILE | grep "Success rate"
  ```

- [ ] **R2 connectivity stable** (no sustained failures)
  - No single-cause failure lasting > 1 hour
  - Temporary timeouts < 1% acceptable

- [ ] **Sync markers being set** (database writes working)
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM labelJob WHERE labelsPdfSyncedAt IS NOT NULL" | tail -1
  # Expected: > 0
  ```

- [ ] **Cleanup protection working** (unsynced files preserved)
  ```bash
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM labelJob WHERE labelsPdfSyncedAt IS NULL AND labelsPdfDeletedAt IS NULL" | tail -1
  # Expected: Only young files
  ```

- [ ] **No memory leaks** (heap stable over 24 hours)
  - Initial heap: ~200MB
  - Final heap: ~250MB max (25% growth acceptable)

- [ ] **Canary mode working** (correct % of jobs dual-write)
  ```bash
  npm run r2:telemetry-summary | grep "Canary pass rate"
  # Expected: ~5% if canaryPercentage=5
  ```

- [ ] **Rollback path confirmed safe**
  ```bash
  npm run r2:rollback-check
  ```

### No-Go Criteria (Any True = Rollback)

- [ ] **Dual-write success rate < 95%**
  - Investigate root cause
  - Fix and re-test

- [ ] **R2 connectivity unstable** (>1% failures sustained)
  - Check R2 status page
  - Verify credentials not expired
  - Test from different network

- [ ] **Database unavailable** (cannot set sync markers)
  - Restart PostgreSQL
  - Check connection limits
  - Investigate long queries

- [ ] **Memory leaks detected** (heap growth > 50%)
  - Identify leak with heap snapshots
  - Fix and rebuild API
  - Re-test

- [ ] **Cleanup not protecting files** (deleting unsynced PDFs)
  - CRITICAL: Stop immediately
  - Rollback staging
  - Investigate cleanup logic
  - Fix and re-test

## Verified Phase 4 Operator Outcome

- The canary upload completed successfully with one authenticated job only.
- The job produced a local PDF first and then mirrored to R2.
- The rollback path remained instant and local-only startup succeeded on a separate port.

Final evidence: [PHASE-4-LIVE-CANARY-FINAL-REPORT.md](PHASE-4-LIVE-CANARY-FINAL-REPORT.md)

---

## Escalation Procedures

### If S1 Activation Fails

1. **Immediate:** Kill all S1 processes
   ```bash
   npm stop
   ```

2. **Check:** Root cause
   ```bash
   npm run r2:verify
   npm run r2:canary-check
   npm run infra:check
   ```

3. **Escalate:** If > 15 minutes of debugging without progress
   - Contact Cloudflare Support (R2 issues)
   - Contact team lead (code issues)

### If Soak Test Fails

1. **Immediate:** Disable S1 (leave running for analysis)
   ```bash
   # Don't kill - let logs accumulate
   unset STAGING_R2_ENABLED
   npm run dev:api  # Restart without S1
   ```

2. **Collect:** Diagnostics
   ```bash
   tar czf s1-failure-diagnostics.tar.gz \
     logs/ $TELEMETRY_LOG_FILE
   ```

3. **Analyze:** Telemetry
   ```bash
   npm run r2:telemetry-summary $TELEMETRY_LOG_FILE
   ```

4. **Escalate:** With data to team lead or Cloudflare

### If Production Issue Suspected

1. **Rollback immediately**
   ```bash
   unset STAGING_R2_ENABLED
   unset ENABLE_DUAL_WRITE
   unset ENABLE_R2_UPLOADS
   npm run dev:api
   ```

2. **Verify:** Local-only mode active
   ```bash
   npm run r2:rollback-check
   ```

3. **Assess:** Damage
   - What was affected?
   - How many jobs?
   - Were synced markers set?

4. **Escalate:** Immediately to team lead with context

---

## Success Criteria Summary

**S1 is ready for advanced stages when:**

✓ 24-hour soak test completes with > 95% success rate
✓ All telemetry events flowing correctly
✓ Cleanup protecting unsynced files
✓ Database sync markers being set
✓ No memory leaks detected
✓ Canary mode limiting blast radius
✓ Rollback path confirmed safe
✓ Operator comfortable with procedures

**Next stage: S2 (Dual-Read Fallback)**
- Will enable ENABLE_DUAL_READ=true
- Tests R2 read fallback (local miss → R2 fallback)
- Requires S1 validation complete

---

## Documentation Index

- [S1 Execution Runbook](s1-execution-runbook.md) - Step-by-step procedures
- [S1 Safety Rules](s1-staging-safety-rules.md) - Core constraints
- [S1 Telemetry Interpretation](s1-telemetry-interpretation.md) - Event reference
- [R2 Troubleshooting](r2-troubleshooting.md) - Problem solving
- [Storage Architecture](architecture/storage-rollout-architecture.md) - Technical overview

---

## Quick Reference Commands

```bash
# Verify R2 bucket access
npm run r2:verify

# Check canary mode
npm run r2:canary-check

# Validate rollback safety
npm run r2:rollback-check

# Analyze telemetry
npm run r2:telemetry-summary $TELEMETRY_LOG_FILE

# Check infrastructure
npm run infra:check

# Verify API builds
npm run build --workspace=@labelgen/api

# Verify worker builds
npm run build --workspace=@labelgen/worker
```
