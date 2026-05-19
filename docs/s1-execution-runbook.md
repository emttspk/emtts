# Stage S1: Controlled Cloudflare R2 Staging - Execution Runbook

**IMPORTANT: New Environment Bootstrap System**

As of May 18, 2026, S1 staging uses a **unified environment loader** to eliminate env drift between root tooling, API, and Worker processes. 

**Before reading this runbook, please review:**
- 📖 [S1 Environment Bootstrap Guide](./S1_ENV_BOOTSTRAP_GUIDE.md) — Complete env setup and PowerShell/shell procedures
- This includes local staging setup, precedence rules, and safe secret handling

**Quick Summary:**
- Use `.env.staging.local` instead of shell exports
- Load via `scripts/staging-env-load.ps1` (PowerShell) on Windows
- Validate with `npm run staging:env:check`
- All S1 tooling scripts now automatically load canonical env

---

## Overview

Stage S1 enables controlled, limited dual-write mirroring to Cloudflare R2 in a staging environment. This runbook provides step-by-step procedures for safely enabling, monitoring, and rolling back S1 staging.

**Key Properties:**
- ✓ Local storage remains authoritative
- ✓ Async non-blocking R2 uploads (never block job completion)
- ✓ Canary mode limits blast radius
- ✓ Instant rollback capability (flags disabled = local-only)
- ✓ Comprehensive telemetry for observability

---

## Prerequisites

Before enabling S1 staging:

### 1. Verify S0 FULLY_READY

S0 baseline must be fully operational:

```bash
npm run s0:prereq
```

Expected output: All 7 checks passing
- ✓ .env file exists
- ✓ DATABASE_URL configured
- ✓ REDIS_URL configured  
- ✓ Prisma client generated
- ✓ All R2 flags disabled
- ✓ PostgreSQL reachable on localhost:5432
- ✓ Redis reachable on localhost:6379

### 2. Configure R2 Credentials (Unified Method)

Instead of shell exports, use the new unified environment system:

```powershell
# PowerShell on Windows

# 1. Copy template
Copy-Item .env.staging.local.example .env.staging.local

# 2. Edit with real R2 credentials
notepad .env.staging.local

# 3. Load into shell (every session)
. .\scripts\staging-env-load.ps1

# 4. Verify all required vars are present
npm run staging:env:check
```

For Bash/Zsh on Unix, see [Environment Bootstrap Guide](./S1_ENV_BOOTSTRAP_GUIDE.md#2-quick-start-local-staging-setup).

### 3. Verify R2 Bucket Access

```bash
npm run r2:verify
```

This now auto-loads .env.staging.local and shows diagnostics.

Expected output:
- ✓ Configuration found
- ✓ S3 client created
- ✓ Bucket is reachable
- ✓ Upload permission confirmed
- ✓ Download permission confirmed
- ✓ Presigned URL generation working
- ✓ R2 BUCKET READY FOR STAGE S1 STAGING

---

## S1 Activation Sequence

### Step 1: Ensure Env is Loaded

```powershell
# PowerShell: Verify env is loaded
. .\scripts\staging-env-load.ps1
npm run staging:env:check
```

### Step 2: Enable Staging Master Flag

The STAGING_R2_ENABLED flag is configured in .env.staging.local. Ensure it's set to true:

```env
# In .env.staging.local:
STAGING_R2_ENABLED=true
```

This gates all S1-specific behavior. When disabled, zero overhead.

### Step 3: Enable Canary Mode (Recommended)

```env
# In .env.staging.local:
R2_CANARY_MODE=job-percentage
R2_CANARY_PERCENTAGE=5
```

This limits dual-writes to 5% of jobs, protecting against blast radius.

**Alternative: Job Count Gating**
```env
R2_CANARY_MODE=job-count
R2_CANARY_MAX_JOBS=100
```

Limits dual-writes to first 100 jobs only.

### Step 4: Enable Dual-Write Flags

```env
# In .env.staging.local:
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
```

### Step 5: Start API with Staging Configuration

```bash
STAGING_R2_ENABLED=true \
R2_CANARY_MODE=job-percentage \
R2_CANARY_PERCENTAGE=5 \
ENABLE_DUAL_WRITE=true \
ENABLE_R2_UPLOADS=true \
npm run dev:api
```

### Step 5: Verify Startup Logs

Look for startup messages:

```
╔════════════════════════════════════════════════════════════╗
║  STAGE S1 STAGING MODE ENABLED                             ║
╚════════════════════════════════════════════════════════════╝
[S1 STAGING] Dual-write: enabled
[S1 STAGING] R2 uploads: enabled
[S1 STAGING] Canary mode: job-percentage
[S1 STAGING] Canary limit: 5% of jobs
[S1 STAGING] Credentials: configured
[S1 STAGING] Bucket: configured
```

---

## S1 Validation Sequence

### Test 1: Submit Label Job

Submit a small test batch (5 rows):

```bash
# Via API upload endpoint
curl -X POST http://localhost:3000/api/v1/jobs/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-batch.xlsx"
```

### Test 2: Verify Job Completes

Job should complete immediately (local write completes first):

```
Expected:
- Job status: COMPLETED
- Local PDF: exists at storage/outputs/{jobId}-labels.pdf
- Telemetry event: dual_write_start (logged immediately)
```

### Test 3: Monitor Async R2 Upload

Within 5 seconds, telemetry should show:

```
dual_write_start
dual_write_stream_start
dual_write_success (or dual_write_failure)
dual_write_stream_cleanup
```

### Test 4: Verify R2 Mirror

Check R2 bucket for uploaded PDF:

```bash
# Using AWS CLI with Cloudflare credentials
aws s3 ls s3://labelgen-staging/pdf/ \
  --endpoint-url=https://<account-id>.r2.cloudflarestorage.com
```

### Test 5: Verify Sync Markers

Query database for sync status:

```bash
# Connect to database
psql $DATABASE_URL

# Check sync markers
SELECT id, labelsPdfPath, labelsPdfSyncedAt FROM labelJob 
WHERE id = 'job-xxxx' LIMIT 1;

# Expected: labelsPdfSyncedAt should be NOT NULL (recent timestamp)
```

### Test 6: Check Canary Statistics

```bash
npm run r2:canary-check
```

Expected output:
```
✓ Staging enabled: STAGING_R2_ENABLED=true
✓ Dual-write enabled: ENABLE_DUAL_WRITE=true
✓ R2 uploads enabled: ENABLE_R2_UPLOADS=true
✓ Canary mode: job-percentage (5% of jobs)
```

### Test 7: Validate Telemetry

```bash
npm run r2:telemetry-summary $TELEMETRY_LOG_FILE
```

Expected output:
```
✓ Dual-write starts: X
✓ Dual-write successes: X
✓ Dual-write failures: 0 (or low)
✓ Dual-write cleanups: X
Success rate: 100% (or high)
✓ Canary jobs allowed: X
✓ Canary jobs skipped: X
```

---

## S1 Extended Soak Test

Run S1 staging continuously for 24 hours:

### Phase 1: Hours 0-4 (Baseline)

- Monitor telemetry: all events should flow smoothly
- Monitor metrics: activeDualWritesGauge should oscillate 0-5
- Monitor logs: no errors or connection issues
- Monitor R2: objects accumulating in bucket

### Phase 2: Hours 4-12 (Load)

- Submit larger batches (50-100 rows)
- Increase canary percentage: 10%
- Monitor concurrency: semaphore should block at max=5
- Monitor latency: r2_upload_latency_ms should stabilize

### Phase 3: Hours 12-24 (Stability)

- Resume normal traffic
- Verify cleanup cron runs (every 10 minutes)
- Verify sync markers persist in DB
- Verify no memory leaks (heap usage stable)

---

## S1 Cleanup Validation

Cleanup runs hourly with enhanced safety when staging enabled:

### Cleanup Safety Check

```bash
# Cleanup checks:
1. If dual-write enabled: Only delete if synced to R2
2. If dual-write disabled: Always safe to delete (no R2 mirror)
3. 7-day TTL: Files older than 7 days eligible for deletion
4. Active jobs: Never delete files for active/retryable jobs
```

### Verify Cleanup Works

```bash
# Check cleanup logs
tail -f logs/api.log | grep "\[Cleanup\]"

# Expected:
[Cleanup] Deleted orphaned file: storage/outputs/old-job-labels.pdf
[Cleanup] Skipped file (R2 sync pending): storage/outputs/pending-job-labels.pdf
```

---

## Rollback from S1

If S1 validation fails or issues detected:

### Quick Rollback (Instant)

```bash
# Disable staging - jobs immediately revert to local-only
unset STAGING_R2_ENABLED
unset ENABLE_DUAL_WRITE
unset ENABLE_R2_UPLOADS

# Restart API
npm run dev:api
```

Expected: Jobs complete with local PDFs only, zero R2 access.

### Verify Rollback Safe

```bash
npm run r2:rollback-check
```

Expected output:
```
✓ Storage provider is 'local' (authoritative)
✓ Dual-read is not enabled (ready for rollback)
✓ All flags already disabled (local-only mode active)
✓ Rollback path is safe
```

### Post-Rollback

After rollback:
- All jobs continue using local storage
- Previous R2 objects remain in bucket (for reference, can be cleaned later)
- Database sync markers persist (informational only after rollback)
- Full resume to local-only takes <30 seconds

---

## Troubleshooting

### Issue: R2 Uploads Failing 100%

**Symptoms:**
- dual_write_failure events in telemetry
- labelsPdfSyncedAt remains NULL in database
- R2 bucket is empty

**Diagnosis:**
```bash
npm run r2:verify --verbose
```

**Solutions:**
1. Check R2 credentials: Are they still valid?
2. Check R2 endpoint: Is it reachable?
3. Check R2 bucket permissions: Write permission on bucket?
4. Check network: Is R2 endpoint reachable from local?

### Issue: Canary Mode Not Working

**Symptoms:**
- All jobs dual-writing despite canary mode enabled
- Or: No jobs dual-writing despite canary enabled

**Diagnosis:**
```bash
npm run r2:canary-check --verbose
```

**Solutions:**
1. Verify STAGING_R2_ENABLED=true
2. Verify R2_CANARY_MODE set to 'job-percentage' or 'job-count'
3. Verify R2_CANARY_PERCENTAGE in range 1-100
4. Check telemetry for canary_skip/canary_allowed events

### Issue: High R2 Upload Latency

**Symptoms:**
- r2_upload_latency_ms > 5000ms frequently
- Jobs appear delayed (they shouldn't be - but monitoring shows R2 is slow)

**Diagnosis:**
```bash
npm run r2:telemetry-summary $TELEMETRY_LOG_FILE
```

Look for P95 latency > 5000ms

**Solutions:**
1. Check R2 endpoint network latency (ping)
2. Reduce concurrent connections if semaphore full
3. Increase R2_TIMEOUT_MS if timeouts common
4. Consider moving to closer R2 endpoint

### Issue: Rollback Blocked

**Symptoms:**
- Cannot disable STAGING_R2_ENABLED
- Jobs still going to R2 after disabling flags

**Diagnosis:**
1. Verify environment variables actually disabled
2. Verify API/worker restarted after disabling
3. Check that STORAGE_PROVIDER=local (not r2)

**Solutions:**
1. Kill API/worker processes: `npm stop`
2. Unset all variables: `unset STAGING_R2_ENABLED`
3. Restart: `npm run dev:api`
4. Verify: `npm run r2:rollback-check`

---

## Go/No-Go Criteria for S1

### Required for S1 Activation

- ✓ S0 FULLY_READY achieved
- ✓ PostgreSQL reachable
- ✓ Redis reachable
- ✓ R2 credentials configured and verified
- ✓ Canary mode configured (recommended)
- ✓ All R2 flags disabled in baseline

### Required for S1 Continuation

- ✓ Dual-write success rate > 95%
- ✓ No R2 connectivity timeouts (or <1%)
- ✓ Sync markers being set correctly
- ✓ Cleanup protection working (verified with 7-day PDF)
- ✓ Telemetry events flowing consistently
- ✓ No memory leaks after 1 hour
- ✓ Rollback path validated

### No-Go Criteria for S1

- ✗ R2 connectivity unreliable (>5% failure)
- ✗ Database not reachable (cannot set sync markers)
- ✗ Canary mode misconfigured (wrong % or limits)
- ✗ High-risk production traffic (use only in staging)
- ✗ Rollback path blocked or unsafe

---

## Next: Stage S2

Once S1 validation complete:

**S2: Dual-Read Fallback Staging**
- Enable ENABLE_DUAL_READ=true
- Test local-miss → R2 fallback scenario
- Validate fallback doesn't cause issues
- Measure read latency from R2

---

## References

- [Storage Rollout Architecture](architecture/storage-rollout-architecture.md)
- [Dual-Write Safety](rollout/storage-rollout-runbook.md)
- [R2 Troubleshooting](r2-troubleshooting.md)
- [Telemetry Guide](s1-telemetry-interpretation.md)
- [Safety Rules](s1-staging-safety-rules.md)

