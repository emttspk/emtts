# Phase 9A Day 4 — Staging Canary Results

> **Fill in each section as the canary executes.**
> This document is the permanent record of the Day 4 staging canary activation.
> Retain regardless of outcome (pass or rollback).

---

## Activation Record

| Field | Value |
|---|---|
| Activation Date | ___________ |
| Activation Time (UTC) | ___________ |
| Operator | ___________ |
| Environment | staging (Railway) |
| Railway Service | ___________ |

---

## Flags Enabled

| Flag | Value Set | Notes |
|---|---|---|
| `DUAL_KEY_LOOKUP_ENABLED` | [ ] true / [ ] false | Step 1 flag |
| `ENABLE_NORMALIZED_LOOKUP_CANDIDATES` | [ ] true / [ ] false | Step 2 flag |
| `LOG_KEY_VERSIONS_IN_TELEMETRY` | [ ] true / [ ] false | Should be true |
| `NORMALIZED_KEYS_FOR_NEW_UPLOADS` | [ ] true / [ ] false | **Must remain false** |
| `ENABLE_NORMALIZED_OBJECT_KEYS` | [ ] true / [ ] false | **Must remain false** |
| `STAGING_R2_ENABLED` | [ ] true / [ ] false | Prerequisite |
| `ENABLE_DUAL_READ` | [ ] true / [ ] false | Prerequisite |
| `ENABLE_R2_UPLOADS` | [ ] true / [ ] false | Prerequisite |

---

## Baseline Measurements (before activation)

| Metric | Value |
|---|---|
| P95 download latency (ms) | ___________ |
| Download success rate (%) | ___________ |
| R2 stream_failure count (per hour) | ___________ |
| R2 HeadObject call rate (per minute) | ___________ |
| R2 stream_timeout count (per hour) | ___________ |
| Reference staging jobId (for test download) | ___________ |

---

## Step 1 Observations — DUAL_KEY_LOOKUP_ENABLED=true only

| Check | Result |
|---|---|
| `compatibility_lookup_metadata_bypass` events appearing | [ ] Yes / [ ] No |
| `metadataBypassReason` value on labels path | ___________ |
| `compatibility_lookup_attempt` with `objectKeyVersion: "normalized"` appearing | [ ] Yes (no-go) / [ ] No (expected) |
| Download success rate unchanged | [ ] Yes / [ ] No |
| Latency unchanged | [ ] Yes / [ ] No |
| Step 1 PASS / FAIL | [ ] PASS / [ ] FAIL |

---

## Step 2 Observations — ENABLE_NORMALIZED_LOOKUP_CANDIDATES=true

### Manual Test Downloads (record each)

#### Test Download 1
| Field | Value |
|---|---|
| Job ID | ___________ |
| Timestamp | ___________ |
| `compatibility_lookup_attempt` normalized | [ ] Appeared / [ ] Missing |
| `compatibility_lookup_miss` normalized | [ ] Appeared / [ ] Missing |
| `compatibility_lookup_attempt` legacy | [ ] Appeared / [ ] Missing |
| `compatibility_lookup_hit` legacy | [ ] Appeared / [ ] Missing |
| `stream_success` | [ ] Appeared / [ ] Missing |
| Download completed successfully | [ ] Yes / [ ] No |
| Latency (ms) | ___________ |

#### Test Download 2
| Field | Value |
|---|---|
| Job ID | ___________ |
| Timestamp | ___________ |
| Telemetry sequence correct | [ ] Yes / [ ] No |
| Download completed successfully | [ ] Yes / [ ] No |
| Latency (ms) | ___________ |

#### Test Download 3
| Field | Value |
|---|---|
| Job ID | ___________ |
| Timestamp | ___________ |
| Telemetry sequence correct | [ ] Yes / [ ] No |
| Download completed successfully | [ ] Yes / [ ] No |
| Latency (ms) | ___________ |

---

## Canary Window Observations (30–60 minutes)

| Time | P95 Latency (ms) | stream_failure count | HeadObject rate | Notes |
|---|---|---|---|---|
| T+10 min | | | | |
| T+20 min | | | | |
| T+30 min | | | | |
| T+45 min | | | | |
| T+60 min | | | | |

---

## Threshold Evaluation

### Success Thresholds

| Threshold | Required | Observed | Pass/Fail |
|---|---|---|---|
| `compatibility_lookup_hit` for legacy | 100% | ___% | |
| `compatibility_lookup_miss` for normalized | 100% | ___% | |
| Download success rate | No regression | ___% | |
| `stream_failure` rate | < 0.5% | ___% | |
| `stream_timeout` count | No increase | ___ | |
| P95 latency increase | < 200ms | ___ms | |
| HeadObject rate increase | ≤ 2× baseline | ___× | |

### No-Go Incidents

| No-Go Trigger | Observed | Action Taken |
|---|---|---|
| `stream_failure` rate > 1% | [ ] Yes / [ ] No | |
| P95 latency increase > 250ms | [ ] Yes / [ ] No | |
| 404/502 on downloads with known R2 legacy key | [ ] Yes / [ ] No | |
| `compatibility_lookup_hit` legacy < 95% | [ ] Yes / [ ] No | |
| HeadObject rate increase > 2× for > 10 min | [ ] Yes / [ ] No | |
| `stream_timeout` spike | [ ] Yes / [ ] No | |
| `metadataBypassReason: "missing_job_id"` on labels path | [ ] Yes / [ ] No | |

---

## Concurrency Observations

| Field | Value |
|---|---|
| MAX_CONCURRENT_STREAMS confirmed | ___________ |
| Max concurrent R2 fallback downloads observed | ___________ |
| Max concurrent HeadObject calls observed | ___________ |
| Any 429 (rate-limit) responses from Cloudflare R2 | [ ] Yes / [ ] No |
| Semaphore concurrency_limit_hit events | ___________ |

---

## Latency Observations

| Field | Value |
|---|---|
| Pre-activation P95 (baseline) | ___________ ms |
| Post-activation P95 (30 min window) | ___________ ms |
| Post-activation P95 (60 min window) | ___________ ms |
| Maximum single-request latency increase observed | ___________ ms |
| Latency threshold breached (> 200ms increase) | [ ] Yes (no-go) / [ ] No |

---

## Rollback Record (if applicable)

| Field | Value |
|---|---|
| Rollback triggered | [ ] Yes / [ ] No |
| Rollback trigger reason | ___________ |
| Rollback initiated at (UTC) | ___________ |
| `ENABLE_NORMALIZED_LOOKUP_CANDIDATES` set to false | [ ] Yes |
| `DUAL_KEY_LOOKUP_ENABLED` set to false | [ ] Yes / [ ] Not required |
| Railway redeploy triggered at | ___________ |
| Restart completed at | ___________ |
| Bypass telemetry reverted to `activation_flag_disabled` | [ ] Confirmed |
| Download success rate returned to baseline | [ ] Confirmed |
| Total rollback time | ___________ minutes |
| Target met (< 15 minutes) | [ ] Yes / [ ] No |

---

## Final Outcome

| Field | Value |
|---|---|
| Canary window completed without no-go | [ ] Yes / [ ] No |
| All success thresholds met | [ ] Yes / [ ] No |
| Rollback required | [ ] Yes / [ ] No |
| Phase 9A Day 4 canary status | [ ] PASSED / [ ] FAILED / [ ] PARTIAL |

---

## Approval / Rejection Decision

> Complete after full canary window.

**Decision:** [ ] APPROVED — proceed to Phase 9B planning
            [ ] REJECTED — investigate findings before any further activation

**Reason / notes:**

```
(operator notes here)
```

**Signed off by:** ___________
**Date:** ___________

---

## Observations Log (freeform)

> Use this section for any additional telemetry events, anomalies, or notes observed during the canary window.

```
(freeform log here)
```
