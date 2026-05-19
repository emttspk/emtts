# Production Rollback Drill Procedure
# Phase 9C — Normalized Upload Key Rollout

**Status:** VERIFIED — READY FOR USE  
**Date Prepared:** May 19, 2026  
**Applies To:** All Phase 9C rollback scenarios  
**RTO (Recovery Time Objective):** < 15 minutes  
**RPO (Recovery Point Objective):** Zero (no data loss)  

---

## OVERVIEW

This document defines the exact rollback procedure, timing expectations, verification
steps, incident template, and severity classification for Phase 9C canary rollouts.

Rollback is **ALWAYS SAFE** at any phase because:
1. Feature flags are the only activation mechanism (environment variables)
2. No irreversible database schema changes were made
3. Local files are always the authoritative source (local-first architecture)
4. R2 objects are never deleted by rollback
5. Legacy keys remain valid and accessible at all times

### ⚠️ CRITICAL PREREQUISITE: STORAGE_PROVIDER=local

**All Phase 1–4 rollback procedures assume STORAGE_PROVIDER=local is set.**

If STORAGE_PROVIDER=r2 during Phase 1–4 operations:
- ❌ Cleanup cron will delete R2 objects directly (irreversible)
- ❌ Rollback cannot recover deleted R2 objects
- ❌ This is a NO-GO condition for Phase 1 activation

**Pre-Rollback Verification:**
```bash
# Confirm STORAGE_PROVIDER before starting Phase 1
echo $STORAGE_PROVIDER
# Expected: "local" (or unset, which defaults to local)
# If output is "r2": ABORT — reset to local first
```

---

## ROLLBACK SEVERITY CLASSIFICATION

### Level 1: Informational Rollback (Planned)

```
Definition: Operator-initiated rollback as part of planned rotation or phase hold.
Triggers:
  - End of phase window without proceeding to next phase
  - Operator decision to pause for review
  - Precautionary rollback before planned maintenance
Response Time: Within 2 hours (during business hours)
Incident Required: NO
Post-Mortem Required: NO
Communication: Internal team note only
```

### Level 2: Warning Rollback

```
Definition: Rollback due to metric degradation that has not reached CRITICAL threshold.
Triggers:
  - dual_write_failure_rate 1%–5% sustained > 30 min
  - r2_upload_latency_ms p99 > 5000ms sustained > 30 min
  - r2TimeoutCounter > 5 in any 15-minute window
  - Unusual key version distribution (but not total failure)
Response Time: Within 30 minutes
Incident Required: YES (Level 2)
Post-Mortem Required: YES (abbreviated)
Communication: On-call + engineering lead notification
```

### Level 3: Critical Rollback

```
Definition: Immediate rollback required due to NO-GO trigger.
Triggers:
  - dual_write_failure_rate > 5%
  - Any Startup Error in production logs
  - Double-prefix keys detected in R2
  - Stream failure rate > 5%
  - Process crash (process.exit(1))
  - r2TimeoutCounter > 10 in any 15-minute window
Response Time: IMMEDIATE (< 5 minutes to initiate)
Incident Required: YES (P1 Incident)
Post-Mortem Required: YES (full)
Communication: On-call + engineering lead + stakeholders
```

---

## PART 1: ROLLBACK COMMANDS (BY PHASE)

### Phase 1 Rollback (5% Canary)

```bash
# ============================================
# PHASE 1 ROLLBACK PROCEDURE
# ============================================
# Expected completion: < 15 minutes

# STEP 1: Capture evidence BEFORE rollback (30 seconds)
date -u > /tmp/rollback_evidence.txt
echo "=== LAST 20 LOG LINES ===" >> /tmp/rollback_evidence.txt
tail -20 /var/log/api/production.log >> /tmp/rollback_evidence.txt
echo "=== TELEMETRY SUMMARY ===" >> /tmp/rollback_evidence.txt
grep "dual_write_failure\|r2_timeout\|stream_failure" /var/log/api/production.log | tail -10 >> /tmp/rollback_evidence.txt

# STEP 2: Update environment variables
# Option A: Railway dashboard → set vars and redeploy
# Option B: Kubernetes
kubectl set env deployment/api \
  NORMALIZED_KEYS_FOR_NEW_UPLOADS=false \
  DUAL_KEY_LOOKUP_ENABLED=false \
  ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

kubectl set env deployment/worker \
  NORMALIZED_KEYS_FOR_NEW_UPLOADS=false \
  DUAL_KEY_LOOKUP_ENABLED=false \
  ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

# STEP 3: Trigger rolling restart
kubectl rollout restart deployment/api deployment/worker
# OR (Railway): Trigger deploy from dashboard after env change

# STEP 4: Monitor restart progress
kubectl rollout status deployment/api
kubectl rollout status deployment/worker
# Expected: "deployment 'api' successfully rolled out"

# STEP 5: Verify startup logs (no errors expected)
kubectl logs -l app=api --since=2m | grep "Startup"
# Expected: NO "[Startup Error]" entries
# Expected: "[Startup Config] Feature Flags" and "[Startup Config] R2 Config"
# NOTE: normalized-key flags are validated internally and not shown in Feature Flags summary.

# STEP 6: Verify legacy upload behavior restored
# Wait for 1 new job to process, then check:
grep '"event":"object_key_version_logged"' /var/log/api/production.log | tail -3
# Expected: keyVersion = "legacy"
```

### Phase 4 Rollback (100% Canary)

```bash
# Same as Phase 1 rollback — flags are the only activation mechanism
# Additionally verify:

# After rollback, confirm legacy resolution for all downloads
grep '"event":"compatibility_lookup_attempt"' /var/log/api/production.log | tail -5
# Expected: compatibilityMode = "legacy-only"

# Verify new uploads are legacy
grep '"event":"object_key_version_logged"' /var/log/api/production.log | tail -5
# Expected: keyVersion = "legacy"
```

### Phase 5 Rollback (Resolver Activation)

```bash
# Phase 5 has TWO additional flags to disable
kubectl set env deployment/api \
  NORMALIZED_KEYS_FOR_NEW_UPLOADS=false \
  DUAL_KEY_LOOKUP_ENABLED=false \
  ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false  ← This was set in Phase 5

kubectl set env deployment/worker \
  NORMALIZED_KEYS_FOR_NEW_UPLOADS=false \
  DUAL_KEY_LOOKUP_ENABLED=false \
  ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

kubectl rollout restart deployment/api deployment/worker

# Verify resolver reverted to legacy-only
grep '"event":"compatibility_lookup_attempt"' /var/log/api/production.log | tail -5
# Expected: compatibilityMode = "legacy-only"
# NOT expected: compatibilityMode = "dual-key"
```

---

## PART 2: ROLLBACK TIMING EXPECTATIONS

### Phase 1–4 Rollback Timeline

```
T+0:00  Decision to rollback made
T+0:30  Evidence captured (logs saved)
T+1:00  Env vars updated in platform
T+2:00  Deployment triggered
T+7:00  Rolling restart begins (Railway/K8s starts replacing pods)
T+12:00 All instances restarted
T+13:00 Startup logs verified (no Startup Error)
T+14:00 First new job uses legacy keys (verified in telemetry)
T+15:00 ✅ ROLLBACK COMPLETE

Note: No client impact during rolling restart (zero-downtime deployment)
      Old instances serve while new instances start up
```

### Phase 5 Rollback Timeline

```
T+0:00  Decision to rollback made
T+0:30  Evidence captured
T+1:00  BOTH flags updated (NORMALIZED + DUAL_KEY + ENABLE_CANDIDATES = false)
T+2:00  Deployment triggered
T+12:00 All instances restarted
T+13:00 Startup logs verified
T+14:00 Download resolver verified (legacy-only probe)
T+15:00 Old job download verified (legacy R2 still works)
T+16:00 ✅ ROLLBACK COMPLETE
```

---

## PART 3: VERIFICATION STEPS

### After Any Rollback — Core Verification

```bash
# 1. No Startup Error in logs
grep "\[Startup Error\]" /var/log/api/production.log | tail -5
# Expected: No output

# 2. Feature flags correctly set
grep "\[Startup Config\] Feature Flags" /var/log/api/production.log | tail -3
# Expected: NORMALIZED_KEYS_FOR_NEW_UPLOADS absent from flags (or false)
# NOTE: config.ts only logs featureFlags (ENABLE_DUAL_WRITE, etc.), not Phase 9B flags
# Verify Phase 9B flags indirectly via telemetry key version

# 3. New uploads use legacy keys
grep '"event":"object_key_version_logged"' /var/log/api/production.log | tail -5
# Expected: keyVersion = "legacy"

# 4. Downloads still work (legacy resolution)
curl -s -o /dev/null -w "%{http_code}" \
  https://<your-api>/<any-old-job-id>/download/labels
# Expected: 200

# 5. No normalized probes in resolver
grep '"compatibilityMode":"dual-key"' /var/log/api/production.log | tail -5
# Expected: No output (after Phase 1–4 rollback)
# Expected for Phase 5 rollback: all resolver events show "legacy-only"

# 6. Verify API health
curl -s https://<your-api>/health | jq '.status'
# Expected: "ok"

# 7. Verify worker is processing
# Check BullMQ dashboard: worker should show "active" state, queue processing
```

### After Phase 5 Rollback — Additional Verification

```bash
# 8. Verify resolver uses legacy-only
grep '"event":"compatibility_lookup_attempt"' /var/log/api/production.log | tail -5
# Expected: compatibilityMode = "legacy-only"

# 9. Verify old job still downloads from R2 (legacy key)
curl -s -o /dev/null -w "%{http_code}" \
  https://<your-api>/<pre-phase5-job-id>/download/labels
# Expected: 200

# 10. Verify new job downloads still work
# (Will serve from local or legacy R2 key)
curl -s -o /dev/null -w "%{http_code}" \
  https://<your-api>/<any-new-job-id>/download/labels
# Expected: 200
```

### State Preservation After Rollback

```
Preserved:
  ✅ Local files (authoritative source, unchanged)
  ✅ R2 legacy objects (never deleted)
  ✅ R2 normalized objects (uploaded during canary, immutable)
  ✅ Database records (sync markers, job status — unchanged)
  ✅ Sync markers (labelsPdfSyncedAt, moneyOrderPdfSyncedAt — unchanged)
  ✅ Feature flags (now set to false — correct state)
  ✅ Cleanup safety (sync markers protect files)

Changed:
  ↩️  New uploads: revert to legacy key format (pdf/generated/{path})
  ↩️  Downloads: revert to legacy-only resolver

Not Changed (Idempotent):
  - Old jobs: still accessible via legacy R2 keys (unchanged)
  - Normalized R2 objects uploaded during canary: remain in bucket
    (can be re-enabled later when issues resolved)
```

---

## PART 4: POST-ROLLBACK VALIDATION (15-Minute Window)

Run this checklist immediately after confirming rollback complete:

```
T+0  [ ] No Startup Error in API logs
T+1  [ ] No Startup Error in Worker logs
T+2  [ ] Health endpoint returns 200
T+3  [ ] New upload telemetry: keyVersion = "legacy"
T+5  [ ] Legacy download test: HTTP 200 (old job)
T+7  [ ] Resolver mode: legacy-only (no dual-key events)
T+10 [ ] Queue processing resumed (worker active)
T+12 [ ] No double-prefix keys in R2 (already expected to be empty)
T+15 [ ] unsyncedArtifactsGauge trending down (not accumulating)
T+15 [ ] ROLLBACK COMPLETE — declare "system stable"
```

---

## PART 5: INCIDENT DOCUMENTATION TEMPLATE

Use this template for Level 2 and Level 3 rollback incidents:

```markdown
# Incident Report — Phase 9C Rollback
**Incident ID:** INC-9C-YYYYMMDD-NNN
**Date/Time:** YYYY-MM-DD HH:MM UTC
**Phase at Time of Rollback:** Phase N (X% canary)
**Severity:** Level 2 / Level 3
**Duration (Detection to Resolution):** HH:MM

---

## Summary
[One-paragraph summary of what happened and what was done]

---

## Timeline

| Time | Event |
|------|-------|
| HH:MM | Anomaly detected via [dashboard/log/alert] |
| HH:MM | On-call notified |
| HH:MM | Root cause identified: [brief description] |
| HH:MM | Rollback decision made by [operator name] |
| HH:MM | Env vars updated, deployment triggered |
| HH:MM | Rolling restart complete |
| HH:MM | Legacy behavior confirmed restored |
| HH:MM | Incident declared resolved |

---

## Root Cause

**Primary Root Cause:** [What caused the failure]
**Contributing Factors:** [Optional secondary causes]
**Code/Config Responsible:** [File and line if applicable]

---

## Evidence Collected

**Log Samples:**
\`\`\`
[Paste relevant log lines here]
\`\`\`

**Metrics at Time of Incident:**
- dual_write_failure_rate: X%
- r2_upload_latency_ms p99: Xms
- r2TimeoutCounter: X/15min

**R2 State:**
- Normalized keys created before rollback: X objects
- Double-prefix keys found: YES / NO (0 expected)

---

## Impact Assessment

- Jobs affected by failure: ~N (X% of daily volume)
- User-facing errors observed: YES / NO
- Data loss: NONE / [describe if any]
- Download failures: NONE / [describe if any]
- Estimated user impact: [Low / Medium / High]

---

## Rollback Result

- Flag state after rollback: NORMALIZED_KEYS_FOR_NEW_UPLOADS=false, DUAL_KEY_LOOKUP_ENABLED=false, ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false
- Legacy upload behavior restored: YES / NO
- Legacy downloads working: YES / NO
- Time to resolution: HH:MM

---

## Action Items

| Item | Owner | Due Date |
|------|-------|----------|
| [Fix root cause] | [Name] | YYYY-MM-DD |
| [Add monitoring for condition that caused this] | [Name] | YYYY-MM-DD |
| [Re-test in staging before retry] | [Name] | YYYY-MM-DD |

---

## Re-Activation Plan

**Minimum Wait:** 24 hours (or until root cause resolved)
**Required Before Re-Activation:**
- [ ] Root cause identified and fixed
- [ ] Fix validated in staging
- [ ] All action items closed
- [ ] Engineering lead sign-off
```

---

## PART 6: ROLLBACK DRILL (DRY-RUN PROCEDURE)

Run this drill in STAGING before Phase 1 production activation.

### Drill Setup

```bash
# Ensure staging is in Phase 1 state (all 3 flags ON)
# R2_CANARY_MODE=job-percentage R2_CANARY_PERCENTAGE=5
echo "STAGING CANARY STATE:"
grep "NORMALIZED_KEYS_FOR_NEW_UPLOADS\|DUAL_KEY_LOOKUP_ENABLED\|ENABLE_NORMALIZED_LOOKUP_CANDIDATES" /proc/1/environ 2>/dev/null || echo "(check platform env dashboard)"
```

### Drill Step 1: Verify Pre-Rollback State

```bash
# Confirm staging shows normalized uploads
grep '"event":"object_key_version_logged"' /var/log/api/staging.log | tail -3
# Expected: keyVersion = "normalized"
```

### Drill Step 2: Execute Rollback Commands

```bash
# In staging only — simulate rollback
# Set staging env vars:
NORMALIZED_KEYS_FOR_NEW_UPLOADS=false
DUAL_KEY_LOOKUP_ENABLED=false
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false
# Redeploy staging
```

### Drill Step 3: Verify Post-Rollback State

```bash
# Confirm staging reverts to legacy
grep '"event":"object_key_version_logged"' /var/log/api/staging.log | tail -3
# Expected: keyVersion = "legacy"

# Confirm old job still downloads
curl -s -o /dev/null -w "%{http_code}" \
  https://<staging-api>/<old-job-id>/download/labels
# Expected: 200

# Record drill timing
echo "Drill started: $(date -u)"
echo "Drill completed: $(date -u)"
echo "Total time: XX minutes"
```

### Drill Success Criteria

```
[ ] Env vars updated in < 1 minute
[ ] Staging restart complete in < 10 minutes
[ ] Legacy uploads confirmed in < 12 minutes
[ ] Legacy downloads confirmed in < 14 minutes
[ ] Total drill time: < 15 minutes
[ ] No data loss observed
[ ] All verification steps passed
[ ] Operator confirms: "DRILL PASS"
```

### Drill Result Template

```
Rollback Drill Result
Date: YYYY-MM-DD
Operator: [Name]
Environment: STAGING
Phase Simulated: Phase 1 (5% canary)

Step 1 (Env update):    XX seconds ✅/❌
Step 2 (Deploy):        XX minutes ✅/❌
Step 3 (Restart):       XX minutes ✅/❌
Step 4 (Verification):  XX minutes ✅/❌
Total Time:             XX minutes ✅/❌ (target < 15 min)

Data Loss:     NONE ✅
Download Test: PASS ✅
Upload Revert: PASS ✅

DRILL RESULT:  PASS ✅ / FAIL ❌

Signed: _______________  Date: ____________
```

---

## PART 7: KNOWN SAFE STATES

At any point during Phase 9C, the system can be in one of these states:

### State A: Legacy-Only (Default / Post-Rollback)

```
NORMALIZED_KEYS_FOR_NEW_UPLOADS=false
DUAL_KEY_LOOKUP_ENABLED=false
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

Behavior:
- Uploads: legacy keys (pdf/generated/{path})
- Downloads: legacy-only resolver (1 probe)
- Old jobs: ✅ accessible
- New jobs: ✅ accessible via local or legacy R2
Status: 100% SAFE
```

### State B: Phase 1–4 (Upload Normalization, No Resolver)

```
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true
DUAL_KEY_LOOKUP_ENABLED=true
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false

Behavior:
- Uploads: normalized keys (pdf/production/{jobId}/{type}.pdf)
- Downloads: legacy-only resolver (bypass telemetry emits, no probes)
- Old jobs: ✅ accessible (legacy resolver unchanged)
- New jobs: ✅ accessible via local file (R2 fallback won't find normalized yet)
Status: SAFE (upload normalization active, download unchanged)

WARNING: New jobs accessed via R2 fallback (local missing) will return 404
         from R2 (normalized key exists but resolver doesn't probe it yet).
         This is EXPECTED in Phase 1–4 and only affects R2 fallback path.
         Local file always serves as primary source.
```

### State C: Phase 5 (Upload + Resolver Active)

```
NORMALIZED_KEYS_FOR_NEW_UPLOADS=true
DUAL_KEY_LOOKUP_ENABLED=true
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=true

Behavior:
- Uploads: normalized keys
- Downloads: dual-key resolver (normalized probe first, legacy fallback)
- Old jobs: ✅ accessible (legacy probe always included)
- New jobs: ✅ accessible via normalized R2 key
Status: SAFE (both upload + download paths normalized)
```

---

**Rollback Drill Version:** 1.0.0  
**Prepared:** May 19, 2026  
**Related Docs:** [production-phase1-activation-runbook.md](production-phase1-activation-runbook.md), [production-canary-monitoring.md](production-canary-monitoring.md)  
