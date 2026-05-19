# R2 Troubleshooting Guide

## Problem: R2 Connectivity Check Fails

### Error: "Bucket is not reachable"

**Symptoms:**
```
npm run r2:verify
❌ Connectivity failed: Unable to reach endpoint
```

**Root Causes:**
1. R2_ENDPOINT is invalid or wrong
2. R2 service is down
3. Network blocked (firewall, proxy, etc.)

**Diagnosis Steps:**

```bash
# 1. Verify endpoint format
echo $R2_ENDPOINT
# Expected: https://<account-id>.r2.cloudflarestorage.com

# 2. Test network connectivity
ping $(echo $R2_ENDPOINT | sed 's|https://||' | sed 's|/.*||')
# Expected: Responds (no "Host unreachable")

# 3. Test HTTPS connection
curl -I $R2_ENDPOINT
# Expected: HTTP 200 or 404 (not connection refused)
```

**Solutions:**

1. **Wrong endpoint:**
   ```bash
   # Get correct endpoint from Cloudflare R2 dashboard
   # Format: https://<account-id>.r2.cloudflarestorage.com
   export R2_ENDPOINT="https://CORRECT_ENDPOINT"
   npm run r2:verify
   ```

2. **Firewall blocking:**
   ```bash
   # Check if HTTPS port 443 is open
   curl -v https://google.com  # Test if HTTPS works at all
   
   # If HTTPS works but R2 doesn't, check if endpoint is on allowlist
   # Contact network admin to allowlist R2 endpoint
   ```

3. **R2 service degradation:**
   ```bash
   # Check Cloudflare status page
   # https://www.cloudflarestatus.com
   
   # Retry verification later
   sleep 60
   npm run r2:verify
   ```

---

## Problem: Upload Permission Denied

### Error: "Upload permission denied: AccessDenied"

**Symptoms:**
```
npm run r2:verify
❌ Upload permission denied: AccessDenied (Code: 403)
```

**Root Causes:**
1. R2 credentials don't have write permission
2. R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY wrong
3. API token revoked or expired

**Diagnosis Steps:**

```bash
# 1. Verify credentials are set
echo "Access Key ID: ${R2_ACCESS_KEY_ID:0:8}..."
echo "Secret: ${R2_SECRET_ACCESS_KEY:0:8}..."
# Expected: Both have values

# 2. Check credential format
# Access Key ID should be ~24 chars
# Secret Key should be ~36 chars
echo "${#R2_ACCESS_KEY_ID}"
echo "${#R2_SECRET_ACCESS_KEY}"

# 3. Get credentials from Cloudflare R2 dashboard
# Settings → API Tokens → Create Token (or use existing)
# Select: "Edit" permission on all buckets
```

**Solutions:**

1. **Wrong credentials:**
   ```bash
   # Get fresh token from Cloudflare dashboard
   export R2_ACCESS_KEY_ID="new-access-key"
   export R2_SECRET_ACCESS_KEY="new-secret-key"
   npm run r2:verify
   ```

2. **Permission scoped to different bucket:**
   ```bash
   # Create new token with correct bucket permissions
   # Cloudflare → R2 → Settings → API Tokens
   # Select "labelgen-staging" bucket specifically
   ```

3. **Token expired:**
   ```bash
   # Regenerate token
   # Cloudflare → R2 → Settings → API Tokens → Create New Token
   # Store new credentials in .env
   ```

---

## Problem: Bucket Not Found

### Error: "Bucket does not exist"

**Symptoms:**
```
npm run r2:verify
❌ Connectivity failed: The specified bucket does not exist
```

**Root Causes:**
1. R2_BUCKET name is wrong
2. Bucket doesn't exist in R2
3. Credentials scoped to different account

**Diagnosis Steps:**

```bash
# 1. List all available buckets (requires valid credentials)
# Use AWS CLI with R2 endpoint:
aws s3 ls --endpoint-url=$R2_ENDPOINT

# 2. Verify bucket name exactly matches
echo $R2_BUCKET
# Expected: labelgen-staging (or actual bucket name)

# 3. Check in Cloudflare dashboard
# R2 → Buckets → List all buckets
```

**Solutions:**

1. **Bucket name typo:**
   ```bash
   # Fix bucket name
   export R2_BUCKET="labelgen-staging"  # Correct name
   npm run r2:verify
   ```

2. **Bucket doesn't exist:**
   ```bash
   # Create bucket in Cloudflare dashboard
   # R2 → Create Bucket → labelgen-staging
   # Wait 30 seconds for propagation
   npm run r2:verify
   ```

3. **Different account:**
   ```bash
   # Verify credentials are for same account as bucket
   # Create new token scoped to correct account
   ```

---

## Problem: Dual-Write Succeeds But No File In R2

### Symptoms:
```
npm run r2:telemetry-summary
✓ Dual-write successes: 10
✓ Dual-write failures: 0

# But checking R2 bucket shows empty
aws s3 ls s3://labelgen-staging/pdf/ --endpoint-url=$R2_ENDPOINT
# Returns: empty listing
```

**Root Causes:**
1. Files uploaded to wrong path in bucket
2. Presigned URL issue (files signed but not accessible)
3. R2 object key path misconfigured

**Diagnosis Steps:**

```bash
# 1. List all objects in bucket (including sub-paths)
aws s3 ls s3://labelgen-staging/ --endpoint-url=$R2_ENDPOINT --recursive

# 2. Check if files in unexpected path
aws s3 ls s3://labelgen-staging/pdf/ --endpoint-url=$R2_ENDPOINT
aws s3 ls s3://labelgen-staging/labels/ --endpoint-url=$R2_ENDPOINT
aws s3 ls s3://labelgen-staging/ --endpoint-url=$R2_ENDPOINT

# 3. Check eTag from telemetry matches R2
npm run r2:telemetry-summary | grep eTag
aws s3 ls s3://labelgen-staging/ --endpoint-url=$R2_ENDPOINT --summarize

# 4. Check R2 dashboard directly for stored objects
# Cloudflare → R2 → labelgen-staging → Browse
```

**Solutions:**

1. **Files in unexpected path:**
   ```bash
   # Update R2_UPLOAD_PATH in config
   export R2_UPLOAD_PATH="pdf/"
   
   # Or verify path in writeToR2 function
   grep "r2Key =" apps/api/src/storage/provider.ts
   ```

2. **Presigned URL not working:**
   ```bash
   # Test presigned URL manually
   npm run r2:verify --verbose | grep "URL:"
   # Try accessing URL in browser
   # Expected: File downloads or 403 (depending on expiry)
   ```

3. **Path configuration wrong:**
   ```bash
   # Check what path is being used
   grep -r "uploadPath\|r2Key\|pdf" apps/api/src/storage/provider.ts
   
   # Update to correct format:
   # Expected: "pdf/job-xxxx-labels.pdf"
   ```

---

## Problem: Upload Timeout

### Symptoms:
```
npm run r2:telemetry-summary
dual_write_failure: RequestTimeout

# or
dual_write_failure: Socket timeout after 5000ms
```

**Root Causes:**
1. R2 endpoint too far away (high latency)
2. Network congestion
3. R2_TIMEOUT_MS too low for file size
4. ISP throttling large uploads

**Diagnosis Steps:**

```bash
# 1. Measure latency to R2 endpoint
ping $(echo $R2_ENDPOINT | sed 's|https://||' | sed 's|/.*||')
# Expected: < 100ms for nearby regions

# 2. Check timeout setting
echo $R2_TIMEOUT_MS
# Default: 5000ms

# 3. Test upload speed
# Create 10MB test file
dd if=/dev/zero of=/tmp/test-10mb bs=1M count=10

# Upload and time it
time aws s3 cp /tmp/test-10mb s3://labelgen-staging/test-10mb \
  --endpoint-url=$R2_ENDPOINT
# Should complete in < 5000ms on good connection

# 4. Check for network issues
# Multiple ping attempts to measure variance
for i in {1..10}; do ping -c 1 $R2_ENDPOINT; done | grep time
```

**Solutions:**

1. **Latency too high:**
   ```bash
   # Use closer R2 endpoint
   # Cloudflare has multiple regions
   # Check: Settings → General → Endpoint
   
   # Or increase timeout
   export R2_TIMEOUT_MS=10000  # 10 seconds
   ```

2. **Network congestion:**
   ```bash
   # Reduce concurrent uploads (limit to 1-2)
   export R2_MAX_CONCURRENT_UPLOADS=2
   
   # Or increase timeout
   export R2_TIMEOUT_MS=10000
   ```

3. **Large files timing out:**
   ```bash
   # Estimate timeout needed: file_size / upload_speed
   # For 10MB at 1MB/s = 10 seconds
   export R2_TIMEOUT_MS=15000  # 15 seconds to be safe
   ```

---

## Problem: Database Sync Marker Not Set

### Symptoms:
```
dual_write_success event in telemetry
BUT
SELECT labelsPdfSyncedAt FROM labelJob WHERE id = 'job-xxxx'
# Returns: NULL (or error)
```

**Root Causes:**
1. Database connection failed after R2 upload succeeded
2. UPDATE query didn't execute
3. Database transaction rolled back

**Diagnosis Steps:**

```bash
# 1. Check database reachability
psql $DATABASE_URL -c "SELECT 1"
# Expected: result with "1"

# 2. Check database migrations ran
psql $DATABASE_URL -c "\\d labelJob"
# Expected: Table exists with labelsPdfSyncedAt column

# 3. Check sync marker query result directly
psql $DATABASE_URL -c "SELECT COUNT(*) FROM labelJob WHERE labelsPdfSyncedAt IS NOT NULL"

# 4. Check recent updates
psql $DATABASE_URL -c "SELECT id, labelsPdfSyncedAt FROM labelJob ORDER BY updatedAt DESC LIMIT 5"
```

**Solutions:**

1. **Database offline:**
   ```bash
   # Verify DATABASE_URL is correct
   echo $DATABASE_URL
   
   # Test connection
   psql $DATABASE_URL -c "SELECT version()"
   
   # If fails, start local database
   npm run infra:up
   ```

2. **Column doesn't exist:**
   ```bash
   # Run migrations
   npm run prisma:migrate --workspace=@labelgen/api
   
   # Or reset schema
   npm run prisma:db:push --workspace=@labelgen/api
   ```

3. **Transaction conflict:**
   ```bash
   # Check for transaction errors in logs
   grep -i "transaction\|rollback" logs/api.log
   
   # Verify Prisma connection pool settings
   grep CONNECTION_POOL apps/api/src/config.ts
   ```

---

## Problem: Cleanup Skipping Synced Files

### Symptoms:
```
staging_cleanup_mode event shows:
fileSkippedUnsync: 10  (stuck, not decreasing)
```

**Root Causes:**
1. Sync marker query returns wrong results
2. Cleanup not checking sync marker correctly
3. Database out of sync with R2

**Diagnosis Steps:**

```bash
# 1. Find unsynced files
psql $DATABASE_URL -c "SELECT id, labelsPdfPath, labelsPdfSyncedAt FROM labelJob WHERE labelsPdfSyncedAt IS NULL AND createdAt < NOW() - INTERVAL '1 hour'"

# 2. Check if file exists locally
ls -la storage/outputs/job-xxxx-labels.pdf

# 3. Check if file exists in R2
aws s3 ls s3://labelgen-staging/pdf/job-xxxx-labels.pdf \
  --endpoint-url=$R2_ENDPOINT

# 4. Check cleanup logs
grep "filesSkippedUnsync\|labelsPdfSyncedAt" logs/worker.log
```

**Solutions:**

1. **Sync marker not set correctly:**
   ```bash
   # Manual fix: Set sync marker if file exists in R2
   psql $DATABASE_URL -c "UPDATE labelJob SET labelsPdfSyncedAt = NOW() WHERE id = 'job-xxxx' AND labelsPdfSyncedAt IS NULL AND EXISTS (SELECT 1 FROM ..."
   
   # Or wait for next cleanup cron to re-attempt
   ```

2. **File doesn't exist in R2:**
   ```bash
   # Re-upload manually or wait for next dual-write cycle
   npm run scripts/resync-unsynced-files.mjs
   ```

3. **Cleanup query wrong:**
   ```bash
   # Verify cleanup query in worker.ts
   grep -A 10 "labelsPdfSyncedAt" apps/worker/src/cleanup.ts
   
   # Should have: WHERE labelsPdfSyncedAt IS NOT NULL
   ```

---

## Problem: Canary Mode Not Working

### Symptoms:
```
All jobs dual-writing despite R2_CANARY_MODE=job-percentage
OR
No jobs dual-writing despite canary disabled

npm run r2:canary-check
⚠️ Canary percentage out of range: 0
```

**Root Causes:**
1. R2_CANARY_MODE not set or wrong value
2. R2_CANARY_PERCENTAGE out of range (0-100)
3. Canary logic not integrated
4. Flag not read correctly

**Diagnosis Steps:**

```bash
# 1. Check environment variable
echo $R2_CANARY_MODE
echo $R2_CANARY_PERCENTAGE
echo $R2_CANARY_MAX_JOBS

# 2. Check startup logs for canary config
npm run dev:api 2>&1 | grep -i "canary"

# 3. Check telemetry for canary events
npm run r2:telemetry-summary | grep -i "canary"

# 4. Manually test canary logic
# (requires code inspection or debug logging)
```

**Solutions:**

1. **Wrong canary mode:**
   ```bash
   # Valid modes: disabled, job-percentage, job-count
   export R2_CANARY_MODE=job-percentage
   npm run dev:api
   ```

2. **Percentage out of range:**
   ```bash
   # Must be 1-100
   export R2_CANARY_PERCENTAGE=5
   # NOT: 0 or 150
   ```

3. **Canary not integrated:**
   ```bash
   # Verify shouldDualWriteThisJob() called
   grep "shouldDualWriteThisJob" apps/api/src/storage/provider.ts
   
   # Should be called before writeToR2Async
   ```

---

## Problem: Rollback Fails

### Symptoms:
```
npm run r2:rollback-check
❌ Rollback is NOT SAFE
```

**Root Causes:**
1. STORAGE_PROVIDER != "local"
2. ENABLE_DUAL_READ still enabled
3. Schema changes made
4. Cleanup safety not preserved

**Diagnosis Steps:**

```bash
# 1. Check storage provider
echo $STORAGE_PROVIDER
# Expected: local (or unset, which defaults to local)

# 2. Check dual-read flag
echo $ENABLE_DUAL_READ
# Expected: unset or false

# 3. Run rollback check with verbose
npm run r2:rollback-check --verbose

# 4. Verify cleanup protection
psql $DATABASE_URL -c "SELECT COUNT(*) FROM labelJob WHERE labelsPdfSyncedAt IS NULL"
# Should be manageable number (not millions)
```

**Solutions:**

1. **STORAGE_PROVIDER not local:**
   ```bash
   # Fix immediately
   export STORAGE_PROVIDER=local
   npm run dev:api
   ```

2. **DUAL_READ enabled:**
   ```bash
   # Disable reads first (S2 feature)
   unset ENABLE_DUAL_READ
   npm run dev:api
   sleep 60  # Wait for in-flight requests
   
   # Then disable staging
   unset STAGING_R2_ENABLED
   npm run dev:api
   ```

3. **Schema migrations pending:**
   ```bash
   # Run all pending migrations before rollback
   npm run prisma:migrate --workspace=@labelgen/api
   npm run r2:rollback-check
   ```

---

## Problem: Memory Leaks During S1

### Symptoms:
```
Heap usage grows continuously
Does not stabilize over time
GC doesn't free memory
```

**Root Causes:**
1. Telemetry events not garbage collected
2. R2 stream references held
3. Database connection pool leaks
4. Metrics history growing unbounded

**Diagnosis Steps:**

```bash
# 1. Monitor heap usage over time
# Run load for 30 minutes, check memory growth
ps aux | grep "node.*dev:api" | awk '{print $6}'
# Run multiple times, should stabilize

# 2. Generate heap snapshot
# Use Node.js --inspect flag
node --inspect=9229 apps/api/src/index.ts

# Connect Chrome DevTools, take heap snapshot

# 3. Check for common leaks
grep -r "\.push\|\.append" apps/api/src | grep -v test
# Look for unbounded arrays
```

**Solutions:**

1. **Telemetry logs accumulating:**
   ```bash
   # Add log rotation
   # Or pipe to /dev/null if not needed
   npm run dev:api > /dev/null 2>&1
   ```

2. **R2 stream references held:**
   ```bash
   # Verify stream cleanup completes
   grep "stream\.destroy\|stream\.end" apps/api/src/storage/provider.ts
   
   # Add proper error handlers
   ```

3. **Database connection leak:**
   ```bash
   # Check Prisma connection pooling
   echo $DATABASE_CONNECTION_LIMIT
   
   # Default should be reasonable (10-20)
   ```

---

## Problem: Metrics Not Updating

### Symptoms:
```
npm run r2:canary-check
No telemetry file configured (TELEMETRY_LOG_FILE not set)
```

**Solutions:**

1. **Enable telemetry file:**
   ```bash
   export TELEMETRY_LOG_FILE=/tmp/s1-telemetry.log
   npm run dev:api 2>&1 | grep '{"timestamp"' >> $TELEMETRY_LOG_FILE
   ```

2. **Redirect stdout to file:**
   ```bash
   npm run dev:api > logs/api.log 2>&1
   npm run r2:telemetry-summary logs/api.log
   ```

---

## Contact & Escalation

## Verified Phase 4 Operational Note

- The live canary did not fail on R2; it failed earlier when the host Redis 3.0.504 listener occupied `localhost:6379`.
- The fix was to remap Docker Redis to `localhost:6380`, which restored BullMQ compatibility with Redis 7.4.9.
- The final canary then completed successfully and the R2 object was verified with `HeadObject`.

Reference: [PHASE-4-LIVE-CANARY-FINAL-REPORT.md](PHASE-4-LIVE-CANARY-FINAL-REPORT.md)

If troubleshooting doesn't resolve:

1. **Collect diagnostics:**
   ```bash
   npm run r2:verify --verbose
   npm run r2:canary-check --verbose
   npm run r2:telemetry-summary $TELEMETRY_LOG_FILE
   npm run infra:check
   ```

2. **Save logs:**
   ```bash
   tar czf s1-diagnostics.tar.gz logs/ storage/
   ```

3. **Review documentation:**
   - [S1 Execution Runbook](s1-execution-runbook.md)
   - [Safety Rules](s1-staging-safety-rules.md)
   - [Telemetry Interpretation](s1-telemetry-interpretation.md)

4. **Check Cloudflare Status:**
   - https://www.cloudflarestatus.com

