# Final Production Go/No-Go Checklist
# Phase 9C Day 6 — 5% Canary Activation (NORMALIZED_KEYS_FOR_NEW_UPLOADS)

**Status:** READY FOR OPERATOR USE  
**Date Prepared:** May 19, 2026  
**Environment:** PRODUCTION ONLY  
**RTO:** < 15 minutes  
**Expected Canary Volume:** ~50 new jobs/day (5% of typical traffic)  
**Phase Duration:** 24 hours (then proceed to Phase 2 or rollback)  

---

## EXECUTIVE SUMMARY

This checklist guides operators through Phase 1 canary activation with exact success criteria,
rollback triggers, and hourly validation steps. **Complete every pre-flight check before proceeding.**

---

## PART 1: EXACT REQUIRED ENVIRONMENT VARIABLES

### Phase 1 Production Flag Set (COPY-PASTE READY)

These are the **exact values** required. Copy all of these into your production environment:

```bash
# === CRITICAL SAFETY REQUIREMENT ===
STORAGE_PROVIDER=local

# === UPLOAD ACTIVATION ===
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true

# === STARTUP VALIDATION REQUIREMENT ===
DUAL_KEY_LOOKUP_ENABLED=true

# === RESOLVER GATE (INTENTIONALLY OFF FOR PHASE 1) ===
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

# === R2 INFRASTRUCTURE (confirm already set) ===
STAGING_R2_ENABLED=true
ENABLE_DUAL_WRITE=true
ENABLE_R2_UPLOADS=true
ENABLE_DUAL_READ=true

# === R2 CANARY CONTROL ===
R2_CANARY_MODE=job-percentage
R2_CANARY_PERCENTAGE=5

# === R2 CONCURRENCY (do not change) ===
R2_MAX_CONCURRENT_STREAMS=5
R2_TIMEOUT_MS=30000
R2_RETRY_LIMIT=3

# === TELEMETRY (non-enforced, for observability) ===
LOG_KEY_VERSIONS_IN_TELEMETRY=true

# === R2 CREDENTIALS (must be already set) ===
R2_ACCESS_KEY_ID=<production_key>
R2_SECRET_ACCESS_KEY=<production_secret>
R2_ENDPOINT=<production_endpoint>
R2_BUCKET=<production_bucket>
R2_REGION=auto
```

### Exact Forbidden Environment Variables

**DO NOT SET** any of these combinations (will cause startup failure):

```bash
# ❌ FORBIDDEN — CAUSES process.exit(1) AT STARTUP
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true
DUAL_KEY_LOOKUP_ENABLED=false      ← Missing required gate!

# ❌ FORBIDDEN — CAUSES UNSAFE DELETION
STORAGE_PROVIDER=r2                ← Cleanup will delete R2 objects directly!
```

### Canonical KPI Interpretation (Authoritative)

For Phase 1 canary isolation decisions, use ONLY:

```
canaryAllowedJobsCounter / (canaryAllowedJobsCounter + canarySkippedJobsCounter)
```

Target range: 4%–6% (expected 5%).

`object_key_version_logged` telemetry is informational only and emitted before canary gating.
Do not use keyVersion ratio as canary-isolation proof.

---

## PART 2: PRE-FLIGHT VERIFICATION CHECKLIST

**Complete every item. Initial each. If any fails, do NOT proceed.**

### Build & Typecheck Validation

```
[ ] _____ 1. Run: npm run build --workspace=@labelgen/api
            Expected: Exit code 0, no compilation errors
            Timestamp: __________

[ ] _____ 2. Run: npm run typecheck --workspace=@labelgen/api
            Expected: Exit code 0, no type errors
            Timestamp: __________

[ ] _____ 3. Verify no package.json changes (no new dependencies)
            Command: git status | grep package.json
            Expected: Clean (no changes)
```

### Infrastructure Checks

```
[ ] _____ 4. R2 Bucket Reachable
            Test: aws s3 ls s3://<R2_BUCKET> (or equivalent)
            Expected: Returns objects, no 403/404 errors
            Timestamp: __________

[ ] _____ 5. R2 Credentials Valid
            Verify: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY set
            Expected: HeadBucket succeeds (no 401 unauthorized)

[ ] _____ 6. Database Connection
            Test: npm run db:check (if available) OR verify Prisma connectivity
            Expected: Connected to production PostgreSQL

[ ] _____ 7. Redis Connection
            Test: redis-cli -h <REDIS_HOST> ping
            Expected: PONG

[ ] _____ 8. Production API Responding
            Test: curl https://<api>/health
            Expected: HTTP 200, { "status": "ok" }
            Timestamp: __________

[ ] _____ 9. Telemetry Dashboard Accessible
            Verify: Can access monitoring/observability platform
            Expected: Live event stream visible

[ ] _____ 10. On-Call Team Ready
             Confirm: On-call engineer available for 24-hour observation window
             Name: ____________
             Contact: ____________
             Timestamp: __________
```

### Safety Verification

```
[ ] _____ 11. Confirm STORAGE_PROVIDER=local
              Command: echo $STORAGE_PROVIDER
              Expected: "local" or empty (empty defaults to local)
              ❌ If output is "r2": ABORT — rollback to local first!

[ ] _____ 12. Staging Canary Results Reviewed
              Result: 847 jobs completed, 100% success rate, 0 double-prefix keys
              Signature: ____________

[ ] _____ 13. Rollback Procedure Tested in Staging
              Test: Deploy with flags OFF, verify legacy behavior returns
              Expected: Legacy uploads resume, downloads work
              Timestamp: __________

[ ] _____ 14. Alert Thresholds Configured
              Verify thresholds set for:
              - dual_write_failure_rate > 5% → Page on-call
              - r2TimeoutCounter > 5 in 15 minutes → Warning escalation
              - r2TimeoutCounter > 10 in 15 minutes → Immediate rollback
              - startup_error count > 0 → Page on-call
              Timestamp: __________

[ ] _____ 15. Stakeholder Sign-Off
              Received: ____________
              Approval: YES [ ]  NO [ ]
              ⚠️ ABORT if NO
```

---

## PART 3: STARTUP EXPECTATIONS

### Expected API Startup Log

After deploying with Phase 1 flags, the API process should log:

```
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

[Startup Warning] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true but ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false.
  Downloads may not find normalized keys until this flag is enabled. (Expected for Phase 1)

NOTE:
NORMALIZED_KEYS_FOR_NEW_UPLOADS, DUAL_KEY_LOOKUP_ENABLED, and ENABLE_NORMALIZED_LOOKUP_CANDIDATES
are validated by startup guards but are not printed in the Feature Flags summary object.
```

### Expected Worker Startup Log

Worker process logs same as above.

### NO-GO: Startup Errors

**If you see any of these, ABORT immediately and rollback:**

```
❌ [Startup Error] NORMALIZED_KEYS_FOR_NEW_UPLOADS=true requires DUAL_KEY_LOOKUP_ENABLED=true
   → Action: Set DUAL_KEY_LOOKUP_ENABLED=true, redeploy

❌ [Startup Error] R2 feature flags enabled but required environment variables are missing
   → Action: Verify R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY are set

❌ process.exit(1) in startup logs
   → Action: Check full logs, identify cause, rollback if uncertain

❌ ECONNREFUSED or database connection errors
   → Action: Verify database is accessible, rollback if persistent
```

---

## PART 4: FIRST-HOUR VALIDATION SEQUENCE

### T+5 minutes (post-deployment)

```
[ ] _____ Confirm both API and Worker processes started without Startup Error
          Command: Check logs for "Startup Error" — expect 0 matches
          Status: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ Health check passes
          Command: curl -s https://<api>/health | jq .status
          Expected: "ok"
          Status: ✓ PASS [ ]  ✗ FAIL [ ]
```

### T+15 minutes

```
[ ] _____ First job submitted to production
          Action: Submit a test label job through normal workflow
          Expected: Job enters queue

[ ] _____ Monitor job processing
          Expected: Job processes within 30-60 seconds
          Status: ✓ PASS [ ]  ✗ FAIL [ ]
```

### T+30 minutes

```
[ ] _____ Verify normalized key was written to R2
          Query: Telemetry dashboard for events where keyVersion="normalized"
          Expected: At least 1 event (5% canary, low initial volume expected)
          Status: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ Verify canary isolation ratio (AUTHORITATIVE KPI)
          Query: dual_write_canary_allowed and dual_write_canary_skip events/counters
          Metric: canaryAllowedJobsCounter / (canaryAllowedJobsCounter + canarySkippedJobsCounter)
          Expected: 4%–6% (target 5%)
          Status: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ Check for dual_write errors
          Query: Logs for "dual_write_failure" or "R2 error"
          Expected: ≤ 0 failures (or < 1%)
          Status: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ Verify no double-prefix keys created
          Query: R2 bucket for keys like "pdf/staging/pdf/staging/..." or "pdf/pdf/..."
          Expected: 0 double-prefix keys
          Status: ✓ PASS [ ]  ✗ FAIL [ ]
```

### T+60 minutes (1 hour checkpoint)

```
[ ] _____ Verify legacy uploads still work
          Action: Submit 5 test jobs, verify they complete
          Expected: All 5 succeed
          Status: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ keyVersion telemetry sanity check (INFORMATIONAL ONLY)
          Query: Last 10 "object_key_version_logged" events
          Expected: keyVersion values present and consistent with upload-path config
          Note: Not used as canary-isolation KPI
          Status: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ No stream failures
          Query: Logs for "stream_failure" events
          Expected: 0 failures
          Actual: _______ failures
          Status: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ Downloads resolve correctly
          Action: Download a test normalized job label and a legacy job label
          Expected: Both download successfully
          Normalized job: ✓ PASS [ ]  ✗ FAIL [ ]
          Legacy job: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ Deterministic fallback path validation
               Action: Force one download through fallback path (local file unavailable for a known job)
               Query: telemetry for the same jobId
               Expected event sequence:
                  1. dual_read_fallback OR provider_fallback
                  2. stream_start (provider=r2)
                  3. stream_success and stream_cleanup (same jobId)
               Success condition: all required events observed for one identical jobId
               Failure interpretation:
                  - No fallback event: fallback path not executed
                  - stream_start without stream_success: fallback executed but stream failed
                  - Missing stream_cleanup: incomplete stream lifecycle instrumentation
```

---

## PART 5: 24-HOUR VALIDATION SEQUENCE

### Hourly Checks (Every 1 hour for 24 hours)

**For each hour (1h, 2h, 3h, 4h, 5h, 6h, 12h, 18h, 24h), record:**

```
Hour ___

[ ] Canary isolation ratio: _____% (target 5%, acceptable 4%–6%)
[ ] Canary counters source: allowed=_____, skipped=_____
[ ] dual_write_failure_count: _____ (should be 0 or < 1%)
[ ] stream_failure_count: _____ (should be 0)
[ ] r2_timeout_count (15-minute window): _____
[ ] Timeout status: WARN if >5 in 15 minutes, CRITICAL if >10 in 15 minutes
[ ] No Startup Error entries: ✓ [ ]  ✗ [ ]
[ ] 404 errors on normalized downloads: _____ (should be 0)
[ ] Downloads complete within SLA (< 3s p99): ✓ [ ]  ✗ [ ]

Issues observed: ____________________________
Action taken: ____________________________
```

### 24-Hour Cumulative Checks

After 24 hours, aggregate metrics:

```
[ ] _____ Normalized uploads: ≥ 50 jobs (5% of daily volume)
            Expected: 40-60 jobs for typical 1000 job/day volume
            Actual: _______ jobs

[ ] _____ No double-prefix keys in R2
            Query: grep for "pdf/staging/pdf" or "pdf/pdf" in R2
            Result: 0 matches ✓ [ ]  > 0 matches ✗ [ ]

[ ] _____ dual_write_failure_rate < 1%
            Metric: total_dual_write_failures / total_uploads
            Actual rate: _____% 
            Status: ✓ PASS (< 1%) [ ]  ✗ FAIL (≥ 1%) [ ]

[ ] _____ stream_failure_rate < 1%
            Metric: total_stream_failures / total_downloads
            Actual rate: _____% 
            Status: ✓ PASS (< 1%) [ ]  ✗ FAIL (≥ 1%) [ ]

[ ] _____ No process crashes or startup errors
            Query: grep "Startup Error\|process.exit\|FATAL" in logs
            Result: 0 entries ✓ [ ]  > 0 entries ✗ [ ]

[ ] _____ No timeout bursts in any 15-minute window
            Warning threshold: >5 in 15 minutes
            Critical threshold: >10 in 15 minutes
            Status: ✓ PASS [ ]  ✗ FAIL [ ]

[ ] _____ Telemetry dashboard shows consistent patterns
            Pattern check: canary isolation ratio stable, no spikes
            Status: ✓ STABLE [ ]  ✗ ANOMALY [ ]
            If anomaly, describe: ____________________________
```

---

## PART 6: ROLLBACK TRIGGER THRESHOLDS (NO-GO CONDITIONS)

**If ANY of these occur at any time during Phase 1, IMMEDIATELY ROLLBACK:**

### Critical Rollback Triggers

```
❌ dual_write_failure_rate > 5% sustained for > 30 minutes
   → Rollback immediately (Level 3)

❌ stream_failure_rate > 5% sustained for > 30 minutes
   → Rollback immediately (Level 3)

❌ Any Startup Error in production logs
   → Rollback immediately (Level 3)

❌ Double-prefix keys detected in R2 (e.g., "pdf/staging/pdf/staging/...")
   → Rollback immediately (Level 3)

❌ Process crash or exit code 1 in startup
   → Rollback immediately (Level 3)

❌ R2 timeout count > 10 in any 15-minute window
   → Immediate rollback (Level 3)

⚠️  R2 timeout count > 5 in any 15-minute window
   → Warning-level escalation (Level 2), prepare rollback

❌ Database connectivity errors sustained > 10 minutes
   → Rollback if related to Phase 1 (Level 2)

⚠️  dual_write_failure_rate 1-5% sustained > 30 minutes
   → Warning-level rollback (Level 2) — monitor closely, may auto-resolve

⚠️  r2_upload_latency_ms p99 > 5000ms sustained > 30 minutes
   → Warning-level rollback (Level 2) — may indicate R2 degradation, not Phase 1 issue
```

---

## PART 7: EXACT NO-GO CONDITIONS FOR PHASE 1 ACTIVATION

**Do NOT proceed with Phase 1 if any of these are true:**

```
❌ Any startup validation failure during pre-flight build/typecheck
❌ STORAGE_PROVIDER != local
❌ R2 credentials invalid or bucket unreachable
❌ Database offline or unreachable
❌ Redis offline or unreachable
❌ Staging canary validation did not pass (847 jobs, 100% success)
❌ Rollback procedure cannot be executed in < 15 minutes
❌ On-call team unavailable for 24-hour observation
❌ Alert thresholds not configured
❌ Stakeholder sign-off not obtained
```

---

## PART 8: EXACT SUCCESS CRITERIA FOR PHASE 1

**Phase 1 is SUCCESSFUL if, after 24 hours:**

```
✅ Normalized uploads: 40-60 jobs (5% canary ratio maintained)
✅ dual_write_failure_rate: < 1% cumulative
✅ stream_failure_rate: < 1% cumulative
✅ No double-prefix keys created
✅ No Startup Errors in production logs
✅ No process crashes or unscheduled restarts
✅ No 15-minute timeout window exceeded warning threshold (>5)
✅ No 15-minute timeout window exceeded critical threshold (>10)
✅ All downloads resolve correctly (legacy and normalized)
✅ Performance within SLA (p99 < 3s)
✅ No customer complaints or escalations
```

**If all ✅ criteria met: PROCEED TO PHASE 2**
**If any criterion fails: HOLD and investigate before proceeding**

---

## PART 9: EXACT ROLLBACK COMMANDS

If rollback is needed at any time:

```text
# ============================================
# PHASE 1 ROLLBACK (< 15 minutes)
# ============================================

# STEP 1: Capture evidence (30 seconds)
date -u > /tmp/phase1_rollback_evidence.txt
tail -50 /var/log/api/production.log >> /tmp/phase1_rollback_evidence.txt
tail -50 /var/log/worker/production.log >> /tmp/phase1_rollback_evidence.txt

# STEP 2: Update platform-managed environment variables to OFF
NORMALIZED_KEYS_FOR_NEW_UPLOADS=false
DUAL_KEY_LOOKUP_ENABLED=false
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

# STEP 3: Redeploy (exact command depends on your platform)

# Railway:
#   1. Go to Dashboard → Environment Variables
#   2. Set vars above to "false"
#   3. Click Deploy (triggers rolling restart)

# Kubernetes:
kubectl set env deployment/api deployment/worker \
  NORMALIZED_KEYS_FOR_NEW_UPLOADS=false \
  DUAL_KEY_LOOKUP_ENABLED=false \
  ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

kubectl rollout restart deployment/api deployment/worker

# PM2:
pm2 set-env NORMALIZED_KEYS_FOR_NEW_UPLOADS=false
pm2 restart all

# STEP 4: Monitor restart
kubectl rollout status deployment/api deployment/worker
# Expected: "deployment 'api' successfully rolled out"

# STEP 5: Verify startup logs
kubectl logs -l app=api --since=2m | grep "Startup"
# Expected: NO "[Startup Error]"
# Expected: "[Startup Config] Feature Flags" and "[Startup Config] R2 Config"
# NOTE: normalized-key flags are validated internally and are not shown in Feature Flags summary log

# STEP 6: Confirm legacy behavior
curl -s https://<api>/health | jq .
# Expected: HTTP 200

# ✅ ROLLBACK COMPLETE (typically 10-15 minutes)
```

---

## PART 10: OPERATOR SIGNOFF

**Complete this section at end of Phase 1 (after 24 hours).**

```
Operator Name:              ____________________________
Operator Title:             ____________________________
Date of Activation:         ____________________________
Date of 24h Validation:     ____________________________

Phase 1 Result:
  ✅ SUCCESSFUL — PROCEED TO PHASE 2  [ ]
  ⚠️  HOLD — INVESTIGATE ISSUES        [ ]
  ❌ ROLLBACK — ISSUES FOUND           [ ]

Issues/Notes:               ____________________________
                            ____________________________
                            ____________________________

On-Call Engineer (24h):     ____________________________
On-Call Phone:              ____________________________

Incident Report Link (if needed): ____________________________

Sign-Off:                   ____________________________
Time:                       ____________________________
```

---

## REFERENCE: ADDITIONAL DOCUMENTATION

- **Full Activation Details:** [production-phase1-activation-runbook.md](../production-phase1-activation-runbook.md)
- **Rollback Procedures:** [production-rollback-drill.md](../production-rollback-drill.md)
- **Readiness Summary:** [../../PRODUCTION_PHASE1_READY.md](../../PRODUCTION_PHASE1_READY.md)
- **Production Monitoring:** [production-canary-monitoring.md](../production-canary-monitoring.md)

---

**DOCUMENT OWNER:** Phase 9C Governance Team  
**LAST UPDATED:** May 19, 2026  
**NEXT REVIEW:** After Phase 1 completion or rollback
