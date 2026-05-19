# Phase 9A Day 4 (Safety Prerequisites)

## Objective
Implement activation-safety prerequisites only. Do not activate normalized lookups.

## Files Modified
- apps/api/src/config.ts
- apps/api/src/storage/key-normalization.ts
- apps/api/src/storage/R2StorageProvider.ts
- apps/api/src/storage/paths.ts
- apps/api/src/routes/jobs.ts
- apps/api/src/telemetry.ts
- docs/storage-key-normalization-migration.md
- docs/phase-9a-day4.md

## Added Safety Prerequisites

### 1) Dedicated Activation Gate
- `ENABLE_NORMALIZED_LOOKUP_CANDIDATES` (default: false)

### 2) Metadata Validation Helper
- `validateCompatibilityLookupMetadata()`
- Validates:
  - type is `pdf`
  - `jobId` exists
  - `artifactType` exists and is supported
  - no forced legacy override

### 3) Metadata Bypass Telemetry
- `compatibility_lookup_metadata_bypass`
- Emits:
  - `metadataValidationResult`
  - `metadataBypassReason`

### 4) Selected Metadata Plumbing
- Label-download fallback path now passes lookup metadata
- Selected `artifactExists` fallback path now accepts and forwards metadata

## Effective Activation Gating
Normalized candidates are eligible only when all are true:
1. `DUAL_KEY_LOOKUP_ENABLED=true`
2. `ENABLE_NORMALIZED_LOOKUP_CANDIDATES=true`
3. metadata validation = valid
4. no forced legacy override

If any condition fails, resolver short-circuits to legacy-only behavior.

## Safety Guarantees
- No normalized uploads enabled
- No key write format changes
- No buildKey behavior changes
- No cleanup behavior changes
- No worker changes
- No DB changes
- No default activation

## Rollback Procedure
1. Set `ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false`
2. Set `DUAL_KEY_LOOKUP_ENABLED=false`
3. Redeploy/restart as needed
4. Verify compatibility resolver is legacy-only
5. Confirm download/upload behavior remains baseline

## No-Go Thresholds
- Build/typecheck failure
- Any download behavior regression with flags OFF
- Any upload behavior regression
- Any streaming behavior regression
- Any cleanup behavior change

## Safety Statement
**Normalized lookup activation is STILL DISABLED by default.**
**With flags OFF, runtime behavior remains legacy-compatible.**

---

## Phase 9A Day 4 — Staging Canary Activation Procedure

> **STAGING ONLY. DO NOT EXECUTE IN PRODUCTION.**
> All steps below apply exclusively to the Railway staging environment.
> Flags must remain false in production until the full staging canary window passes.

### Prerequisites (confirm all before proceeding)

- [ ] `STAGING_R2_ENABLED=true` is set in staging
- [ ] `ENABLE_DUAL_READ=true` is set in staging
- [ ] `ENABLE_R2_UPLOADS=true` is set in staging
- [ ] At least one COMPLETED staging job exists whose labels PDF was dual-written to R2 (confirm via R2 bucket inspection or `dual_read_fallback` telemetry)
- [ ] Operator has access to live structured log stream (Railway log view or equivalent)
- [ ] Baseline download success rate and P95 latency are recorded before proceeding
- [ ] Baseline HeadObject call rate is recorded from Cloudflare R2 dashboard
- [ ] Rollback deploy pipeline is ready (flag flip + Railway redeploy in < 10 minutes)

---

### Step 1 — Enable Bypass Telemetry Gate Only

Set in staging environment:
```
DUAL_KEY_LOOKUP_ENABLED=true
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false   ← keep OFF at this step
```

Deploy/restart the API service. Wait for one full rolling restart to complete.

**Verify:**
- `compatibility_lookup_metadata_bypass` events appear in logs for label download requests
- All bypass events for the labels path show `metadataBypassReason: "activation_flag_disabled"` → this means bypass telemetry is flowing but no normalized probes are firing yet
- No `compatibility_lookup_attempt` events with `objectKeyVersion: "normalized"` should appear
- Download success rate and latency unchanged from baseline

---

### Step 2 — Activate Normalized Lookup Candidates (Labels Path Only)

Once Step 1 telemetry is confirmed, set in staging environment:
```
DUAL_KEY_LOOKUP_ENABLED=true
ENABLE_NORMALIZED_LOOKUP_CANDIDATES=true    ← enable at this step
```

Deploy/restart the API service.

**Immediately trigger 3–5 manual label downloads** using a known completed staging jobId.

---

### Step 3 — Verify Expected Telemetry Pattern

For each triggered label download that reaches the R2 fallback path, confirm this exact sequence in logs:

```
{ event: "compatibility_lookup_attempt", objectKeyVersion: "normalized", lookupAttempt: 1, compatibilityMode: "normalized-first" }
{ event: "compatibility_lookup_miss",    objectKeyVersion: "normalized", lookupAttempt: 1 }
{ event: "compatibility_lookup_attempt", objectKeyVersion: "legacy",     lookupAttempt: 2, compatibilityMode: "normalized-first" }
{ event: "compatibility_lookup_hit",     objectKeyVersion: "legacy",     lookupAttempt: 2 }
{ event: "stream_start",  artifactType: "labelsPdf", provider: "r2" }
{ event: "stream_success",artifactType: "labelsPdf", provider: "r2" }
```

This is the **100% expected pattern** in this canary phase. All normalized probes will miss because no normalized-key uploads exist yet. All legacy probes will hit. Downloads must succeed.

**Any deviation from this pattern is a no-go — see Rollback section.**

---

### Step 4 — Monitor Canary Window

Hold for a minimum observation window of:
- **30 minutes** at off-peak staging load
- **60 minutes** at normal staging load

During this window, monitor all thresholds listed below.

---

### Success Thresholds (canary must satisfy ALL)

| Metric | Required |
|---|---|
| `compatibility_lookup_hit` for legacy candidates | 100% for all R2-synced jobs |
| `compatibility_lookup_miss` for normalized candidates | 100% (expected — no normalized keys exist) |
| Download success rate | No regression vs. baseline |
| `stream_failure` events | < 0.5% absolute, no increase vs. baseline |
| `stream_timeout` events | No increase vs. baseline |
| P95 download latency increase | < 200ms above baseline |
| HeadObject call rate increase | ≤ 2× baseline (one extra probe per R2 fallback download) |
| Any unexpected `metadataBypassReason` on labels path | None — all should resolve to normalized miss + legacy hit |

---

### No-Go Thresholds (roll back IMMEDIATELY if any are observed)

| Trigger | Action |
|---|---|
| `stream_failure` rate > 1% | Immediate rollback — Step A |
| P95 download latency increase > 250ms above baseline | Immediate rollback — Step A |
| Any label download returning 404 or 502 where legacy R2 key was previously reachable | Immediate rollback — Step A |
| `compatibility_lookup_hit` for legacy candidates < 95% | Investigate then rollback |
| HeadObject call rate increase > 2× baseline for > 10 minutes | Pause and investigate; rollback if cause unknown |
| Any `stream_timeout` spike > baseline | Immediate rollback — Step A |
| `metadataBypassReason: "missing_job_id"` appearing on labels download path | Stop — this indicates metadata plumbing regression; rollback |
| Any R2 credentials error | Immediate rollback — Step A |

---

### Rollback Sequence

**Step A — Flag Containment (target < 15 minutes end-to-end):**
1. Set `ENABLE_NORMALIZED_LOOKUP_CANDIDATES=false` in staging env
2. Trigger Railway redeploy / rolling restart
3. Wait for restart to complete (~3–7 minutes)
4. Confirm: `compatibility_lookup_metadata_bypass` events reappear with `metadataBypassReason: "activation_flag_disabled"` for labels path
5. Confirm: no more `compatibility_lookup_attempt { objectKeyVersion: "normalized" }` events
6. Confirm: download success rate and latency return to baseline within 5 minutes of restart

**Step B — Full Rollback (if Step A is insufficient):**
1. Also set `DUAL_KEY_LOOKUP_ENABLED=false` in staging env
2. Trigger Railway redeploy / rolling restart
3. Confirm: no `compatibility_lookup_metadata_bypass` events appear at all (bypass telemetry suppressed)
4. Confirm: all downloads serve legacy path only

**Rollback timing estimate:** Full containment within 15 minutes. No state changes to reverse — rollback is configuration-only.

---

### Operator Monitoring Checklist

```
Before activation:
□ Record baseline P95 download latency (ms)
□ Record baseline download success rate (%)
□ Record baseline HeadObject rate from Cloudflare R2 dashboard
□ Record baseline stream_failure count
□ Confirm at least one R2-synced labels PDF exists for a known stagng jobId

After Step 1 (DUAL_KEY_LOOKUP_ENABLED=true):
□ compatibility_lookup_metadata_bypass events appearing for labels path
□ No compatibility_lookup_attempt events with objectKeyVersion: "normalized"
□ Download success rate unchanged
□ Latency unchanged

After Step 2 (ENABLE_NORMALIZED_LOOKUP_CANDIDATES=true):
□ Manual test job download triggers correct telemetry sequence
□ Normalized probe: miss
□ Legacy probe: hit
□ stream_success event appears
□ P95 latency within 200ms of baseline
□ No stream_failure events
□ HeadObject rate increase ≤ 2×

During canary window:
□ Monitor every 10 minutes for first 30 minutes
□ Monitor every 15 minutes for next 30 minutes
□ Confirm no threshold violations
□ Record all observations in phase-9a-day4-canary-results.md
```

---

### Concurrency/Load Validation Checklist

```
□ MAX_CONCURRENT_STREAMS is 5 (verify from config/env)
□ HeadObject probes are NOT semaphore-controlled — they run outside the semaphore
□ At 5 concurrent R2-fallback downloads: up to 10 concurrent HeadObjects may fire
□ Confirm Cloudflare R2 dashboard shows no 429 (rate-limit) responses during canary
□ Do NOT activate during any known batch-download period
□ Do NOT activate during peak-usage hours
□ If load exceeds 2× normal: defer activation until load is predictable
```

---

### Latency Validation Checklist

```
□ Measure P95 R2 fallback download latency BEFORE activation (baseline)
□ Per-request HeadObject RTT from Cloudflare metrics should be < 80ms
□ After activation: P95 must not increase by more than 200ms
□ If P95 increases > 250ms: rollback immediately
□ Watch for progressive latency accumulation (not just single-request spikes)
□ Monitor first 10 requests individually
□ Monitor 30-minute rolling P95 after activation
□ Monitor 60-minute rolling P95 in sustained canary window
```

---

### Telemetry Interpretation Guide

**Pattern A — Normal canary behavior:**
```
compatibility_lookup_attempt { objectKeyVersion: "normalized" }  → expected
compatibility_lookup_miss    { objectKeyVersion: "normalized" }  → expected (no normalized keys exist)
compatibility_lookup_attempt { objectKeyVersion: "legacy"     }  → expected
compatibility_lookup_hit     { objectKeyVersion: "legacy"     }  → expected
stream_success                                                   → expected
```

**Pattern B — All flags OFF (legacy-only, expected when gates are off):**
```
(no compatibility_lookup_* events — resolver short-circuits before any telemetry)
```

**Pattern C — Bypass telemetry only (DUAL_KEY_LOOKUP_ENABLED=true, candidates OFF):**
```
compatibility_lookup_metadata_bypass { metadataBypassReason: "activation_flag_disabled" }
```
This pattern is expected during Step 1 before candidates are activated.

**Pattern D — Metadata invalid (missing jobId or artifactType — should never appear on labels path):**
```
compatibility_lookup_metadata_bypass { metadataBypassReason: "missing_job_id" | "missing_artifact_type" }
```
If this pattern appears on the labels download path, it indicates a metadata plumbing regression. Stop and investigate.

**Pattern E — No-go: normalized hit (should not appear until Phase 9B normalized uploads):**
```
compatibility_lookup_hit { objectKeyVersion: "normalized" }
```
This pattern is NOT expected during Phase 9A canary. If it appears, verify the R2 bucket for unexpected normalized-key objects before treating as a success.

---

### Safest Expansion Sequence (post-canary)

1. Stage 1 (current): Manual test job only, labels path, staging, off-peak
2. Stage 2: All staging label downloads, sustained 24h clean window
3. Stage 3: Phase 9B normalized upload writes enabled → normalized `compatibility_lookup_hit` events begin
4. Stage 4: After 48h stable normalized hits on labels path, expand to money-order path (requires metadata plumbing in that route first)
5. Stage 5: Production canary after full staging stability window, with identical rollback readiness

---

### Remaining Highest-Risk Edge Case

**Unsemaphored HeadObject burst under concurrent R2 fallback downloads.**

If 20+ concurrent label downloads reach the R2 fallback branch simultaneously (e.g., retry storm or batch download), each issues up to 2 HeadObject calls before semaphore acquisition. This can produce 40+ concurrent HeadObject requests in a short window. Cloudflare R2 does not publish hard rate limits for HeadObject at these volumes. The 2000ms `checkR2ExistsQuick` timeout provides a safety valve — if HeadObjects queue or slow, the fallback aborts and returns a 404 rather than hanging indefinitely. This is safe but could cause brief false-404s under extreme burst load.

**Mitigation:** Activate only during off-peak staging load. Do not activate during any known batch download or retry-storm period.

---

### Final Canary Recommendation

**SAFE TO ACTIVATE STAGING CANARY** — with the following explicit conditions:
1. Staging environment only
2. Labels download R2 fallback path only (sole metadata-enabled path in Phase 9A)
3. First activation with a manually-chosen test job before any organic traffic
4. Off-peak timing
5. Operator monitoring `compatibility_lookup_*` telemetry actively during first 30 minutes
6. Rollback ready (flag flip + Railway redeploy, < 15 minutes to full containment)

**Expected outcome:** 100% legacy fallback hits, zero download regression, zero stream failures, normalized probes all miss (no normalized keys exist yet). The value of this phase is confirming the compatibility layer executes correctly, telemetry flows accurately, and legacy fallback is always reached without regression.

**Record all observations in:** `docs/phase-9a-day4-canary-results.md`
