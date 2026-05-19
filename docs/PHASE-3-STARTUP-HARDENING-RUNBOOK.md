# Phase 3: Startup Hardening - Operator Runbook

## Quick Start

### Local-Only Mode (Default)
```bash
unset STAGING_R2_ENABLED
npm run dev:api
# Expected: Server starts, degraded mode OK
```

### Staging-Enabled Mode
```bash
export STAGING_R2_ENABLED=true
export ENABLE_R2_UPLOADS=true
npm run dev:api
# Expected: All R2 validation passes, then server starts
```

---

## Startup Paths

### Path 1: LOCAL-ONLY (Default)
- Triggered when: STAGING_R2_ENABLED is false or unset
- Behavior: Permissive - HTTP starts even if DB/Redis unavailable
- R2 validation: Skipped
- Fail conditions: None (always starts)

**Example Output:**
```
[STARTUP] Classified as: local-only
[DB] Checking database connectivity...
[REDIS] Checking redis connectivity...
[STARTUP] Infrastructure classification: degraded_no_redis (DB OK, Redis unavailable)
[STARTUP] Starting HTTP server on port 3000
Server running
```

### Path 2: STAGING-ENABLED
- Triggered when: STAGING_R2_ENABLED=true AND ENABLE_R2_UPLOADS=true
- Behavior: Strict - All infrastructure must be ready, R2 must be validated
- R2 validation: Required (fail-fast on any error)
- Fail conditions: 5 scenarios (see below)

**Example Output:**
```
[STAGING] Classified as: staging-enabled
[DB] Validating database (staging requires full readiness)...
[REDIS] Validating redis (staging requires full readiness)...
[STAGING] Infrastructure: fully_ready
[R2] Validating R2 timeout configuration...
[R2] Validating R2 credentials...
[R2] Validating R2 connectivity...
[STAGING] All validations passed!
[STARTUP] Starting HTTP server on port 3000
Server running
```

---

## Fail-Fast Scenarios (Staging Mode Only)

### Scenario 1: Missing Database (Staging)

**Trigger:**
```bash
export STAGING_R2_ENABLED=true
unset DATABASE_URL
npm run dev:api
```

**Expected Failure:**
```
[STAGING] Infrastructure validation required
[DB] Database not reachable
[STAGING] Fail-fast: Infrastructure not ready
Error: Startup validation failed: infrastructure_not_ready
Process exit code: 1
```

**Telemetry:**
```json
{"event":"staging_startup_infrastructure_check","decision":"fail-fast","reason":"database_unavailable"}
```

**Fix:**
```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/labelgen"
npm run dev:api
```

---

### Scenario 2: Missing Redis (Staging)

**Trigger:**
```bash
export STAGING_R2_ENABLED=true
unset REDIS_URL
npm run dev:api
```

**Expected Failure:**
```
[STAGING] Infrastructure validation required
[REDIS] Redis not reachable
[STAGING] Fail-fast: Infrastructure not ready
Error: Startup validation failed: infrastructure_not_ready
Process exit code: 1
```

**Fix:**
```bash
export REDIS_URL="rediss://localhost:6379"
npm run dev:api
```

---

### Scenario 3: Missing R2 Credentials (Staging)

**Trigger:**
```bash
export STAGING_R2_ENABLED=true
export ENABLE_R2_UPLOADS=true
unset R2_ACCESS_KEY_ID
npm run dev:api
```

**Expected Failure:**
```
[R2] Validating credentials...
Error: Missing R2 credentials
Missing: ["R2_ACCESS_KEY_ID"]
Process exit code: 1
```

**Telemetry:**
```json
{"event":"r2_credentials_validation","valid":false,"missing":["R2_ACCESS_KEY_ID"]}
```

**Fix:**
```bash
export R2_ACCESS_KEY_ID="your-key-id"
export R2_SECRET_ACCESS_KEY="your-secret"
npm run dev:api
```

---

### Scenario 4: Wrong R2 Endpoint (Staging)

**Trigger:**
```bash
export R2_ENDPOINT="https://wrong-endpoint.com"
export R2_BUCKET="labelgen"
npm run dev:api
```

**Expected Failure:**
```
[R2] Testing connectivity...
Error: R2 startup validation failed
Errors: ["Could not connect to R2 endpoint"]
Process exit code: 1
```

**Fix:**
```bash
export R2_ENDPOINT="https://your-account.r2.cloudflarestorage.com"
npm run dev:api
```

---

### Scenario 5: Invalid R2_TIMEOUT_MS (Staging)

**Trigger:**
```bash
export STAGING_R2_ENABLED=true
export R2_TIMEOUT_MS="999"  # Too low (min 1000ms)
npm run dev:api
```

**Expected Failure:**
```
[R2] Validating timeout...
Error: R2_TIMEOUT_MS must be between 1000-120000ms
Received: 999ms
Process exit code: 1
```

**Fix:**
```bash
export R2_TIMEOUT_MS="30000"  # 30 seconds
npm run dev:api
```

---

## Telemetry Interpretation

### Event: `startup_path_classified`
**Tells you:** Whether API started in local-only or staging mode

```json
{"event":"startup_path_classified","path":"local-only"}
```

**Action:** None (informational)

---

### Event: `database_validation_check`
**Tells you:** Whether database endpoint is reachable

```json
{
  "event":"database_validation_check",
  "reachable":true,
  "host":"localhost",
  "port":5432,
  "latencyMs":12
}
```

**If reachable=false:**
- Check DATABASE_URL format (must be postgresql://)
- Verify database service is running
- Check network connectivity

---

### Event: `infrastructure_readiness_classified`
**Tells you:** Overall infrastructure health at startup

```json
{
  "event":"infrastructure_readiness_classified",
  "classification":"fully_ready",
  "databaseReachable":true,
  "redisReachable":true,
  "totalLatencyMs":45
}
```

**Classifications:**
- `fully_ready`: Both DB and Redis OK
- `degraded_no_redis`: DB OK, Redis unavailable
- `degraded_no_database`: Redis OK, DB unavailable
- `degraded_no_infrastructure`: Both unavailable

**Action (Local-Only):** Continue startup regardless  
**Action (Staging):** Exit(1) if not `fully_ready`

---

### Event: `r2_connectivity_validation`
**Tells you:** R2 bucket is accessible (staging only)

```json
{
  "event":"r2_connectivity_validation",
  "connectivity":true,
  "uploadable":true,
  "downloadable":true,
  "presignedUrl":true,
  "allValid":true,
  "latencyMs":250
}
```

**If any false:**
- Verify R2 credentials are correct
- Check bucket permissions
- Verify R2 endpoint is correct
- Test with `npm run r2:verify`

---

## Troubleshooting Procedures

### Startup hangs or times out

**Check:**
```bash
# Check infrastructure status
npm run infra:check

# Verify database connectivity
curl $DATABASE_URL  # Will fail gracefully, just tests parsing

# Verify redis connectivity
redis-cli -u $REDIS_URL ping
```

**Fix:**
- Increase R2_TIMEOUT_MS if staging
- Check network latency with `ping`
- Restart database/redis service

---

### Startup exits with "infrastructure not ready" (Staging)

**Check:**
```bash
npm run infra:check

# Review telemetry
tail -f $TELEMETRY_LOG_FILE | jq '.[] | select(.event | contains("infrastructure"))'
```

**Fix:**
1. Ensure both database AND redis are running (staging requires both)
2. For local-only mode, remove STAGING_R2_ENABLED
3. Verify all required R2 variables set (staging mode)

---

### R2 validation fails

**Check:**
```bash
npm run r2:verify
npm run staging:r2:verify
```

**Review telemetry:**
```bash
tail $TELEMETRY_LOG_FILE | jq '.[] | select(.event | contains("r2"))'
```

**Fix:**
- Verify R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
- Check Cloudflare R2 account permissions
- Ensure bucket exists and is accessible
- Test with `curl` to R2 endpoint

---

### Secret leakage detection

**Check:**
```bash
# Search for leaked secrets
grep -i "access.key\|secret.key\|password" $TELEMETRY_LOG_FILE

# All should show boolean or redacted, never actual values
jq '.[] | select(.event | contains("r2")) | keys[]' $TELEMETRY_LOG_FILE
```

**If found:** This is a bug, report immediately

---

## Rollback Procedure

### Quick Rollback (Instant)
```bash
unset STAGING_R2_ENABLED
unset ENABLE_R2_UPLOADS
npm run dev:api
# ← Immediate return to local-only mode
# ← No data loss
# ← Local storage remains authoritative
```

### Verification
```bash
npm run r2:rollback-check
# Output should include:
# ✓ STAGING_R2_ENABLED=false
# ✓ No S1 behavior active
# ✓ Local storage authoritative
# ✓ Rollback verified safe
```

---

## Startup Sequence Verification

### Full Verification
```bash
npm run phase-3-verify
# Exit code 0: All checks passed
# Exit code 1: Something failed (see output)
```

### Partial Verification
```bash
# Just build check
npm run build:api

# Just telemetry
TELEMETRY_LOG_FILE=/tmp/test.log npm run dev:api &
sleep 3
jq '.[] | .event' /tmp/test.log | sort | uniq

# Just config
npm run staging:env:check
```

---

## Monitoring Checklist (Post-Startup)

| Item | Command | Expected |
|---|---|---|
| Server responds | `curl http://localhost:3000/health` | `{"status":"ok"}` |
| DB health | `curl http://localhost:3000/health/db` | `{"status":"ok"}` or `{"status":"error"}` |
| Redis health | `curl http://localhost:3000/health/redis` | `{"status":"ok"}` or `{"status":"error"}` |
| Build clean | `npm run build:api` | Exit code 0 |
| Telemetry logged | `tail $TELEMETRY_LOG_FILE` | 18+ events |
| No secrets | `grep -i password $TELEMETRY_LOG_FILE` | No output |
| Metrics ready | Prometheus `/metrics` | Gauge values present |
| Version info | `curl http://localhost:3000/api/version` | `{"version":"<sha>"}` |

## Verified Phase 4 Results

- Single authenticated canary job completed successfully on 2026-05-18.
- Job ID: `2b737c9c-7fbb-4b04-bd7c-d754a71bdb8a`.
- Local artifact and R2 mirror both exist and match at `85984` bytes.
- Rollback booted cleanly in local-only mode on port `3001`.

See [PHASE-4-LIVE-CANARY-FINAL-REPORT.md](PHASE-4-LIVE-CANARY-FINAL-REPORT.md) for the exact commands and outputs.