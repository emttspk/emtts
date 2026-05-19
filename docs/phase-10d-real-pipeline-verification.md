# Phase 10D Real Dual-Write Pipeline Verification

Status: Operational verification runbook
Date: May 19, 2026
Scope: One production-safe real job through queue and worker

---

## 1) Objective

Trigger and verify one complete real upload pipeline path end-to-end, including canary decision and upload telemetry visibility, without changing runtime behavior or increasing load.

---

## 2) Exact Real Execution Path

### HTTP trigger

Preferred endpoint:
- POST /api/jobs/upload

Compatibility alias (same handler):
- POST /api/upload

Do not use for Phase 10D validation:
- POST /api/jobs/preview/labels (preview-only path)

### Runtime flow map (verified in code)

1. HTTP route handler receives multipart upload
2. Creates LabelJob with status QUEUED
3. Moves uploaded file to storage uploads directory
4. Parses/validates rows and unit checks
5. Enqueues BullMQ job with queue.add
6. Worker picks up job
7. Worker renders PDF via Puppeteer
8. Worker calls writeArtifactWithDualUpload
9. Local artifact write occurs first (authoritative)
10. Upload key computed (legacy or normalized)
11. Telemetry emits dual_write_start and object_key_version_logged
12. Canary gate decides dual-write allowed or skipped
13. If allowed: async R2 upload -> dual_write_success or dual_write_failure
14. Job finalizes COMPLETED

---

## 3) Flag Matrix (Required / Optional / Current Effect)

| Flag | Required for Phase 10D real-path verification | Current effect in code |
|---|---|---|
| STAGING_R2_ENABLED | REQUIRED for any dual-write attempt | Master gate; if false, no dual-write and emits dual_write_master_gate_blocked |
| ENABLE_DUAL_WRITE | REQUIRED | Required with STAGING_R2_ENABLED and ENABLE_R2_UPLOADS to activate dual-write branch |
| ENABLE_R2_UPLOADS | REQUIRED | Required with above for R2 upload path |
| ENABLE_DUAL_READ | OPTIONAL for upload verification | Affects fallback/read path, not upload trigger |
| NORMALIZED_KEYS_FOR_NEW_UPLOADS | REQUIRED to verify normalized key generation | Controls object key version: normalized when true + metadata present |
| DUAL_KEY_LOOKUP_ENABLED | REQUIRED when NORMALIZED_KEYS_FOR_NEW_UPLOADS=true (startup guard) | If false with NORMALIZED true, process exits at startup |
| R2_CANARY_PERCENTAGE | REQUIRED when mode=job-percentage | Defines allow/skip probability |
| TELEMETRY_STDOUT_DUPLICATE | REQUIRED for Railway log visibility when TELEMETRY_LOG_FILE is set | Makes sink mode both instead of file-only |

Important:
- Live values are runtime environment-specific and must be confirmed from startup telemetry event canary_runtime_configuration and telemetry_sink_initialized.

---

## 4) Production-Safe One-Job Test Procedure

### Preconditions

1. Confirm deployment completed and service healthy
2. Confirm startup events exist in logs:
   - telemetry_sink_initialized
   - canary_runtime_configuration
3. Confirm no active incident and no queue backlog spike

### Single-job execution steps

1. Prepare one-row CSV/XLSX sample only (one shipment)
2. Use admin account and submit exactly one real job via POST /api/jobs/upload
3. Set generate labels on, keep volume minimal
4. Wait for job status transition QUEUED -> PROCESSING -> COMPLETED
5. Capture logs filtered by jobId
6. Verify event chain

### Verification chain (single real job)

Required for pass:
- dual_write_start
- object_key_version_logged
- one of:
  - dual_write_success
  - dual_write_canary_skip

Conditional events:
- dual_write_canary_allowed appears when canary permits R2 upload
- dual_write_canary_skip appears when canary denies R2 upload
- dual_write_success appears only when allowed branch executes and upload succeeds

### Safe operational limits

- Maximum test volume: 1 job
- No batch upload
- No concurrent admin test runs
- No forced local file deletion during this step

---

## 5) Expected Timing

Typical timeline for one-row job (non-binding):

- Upload request accepted: 0-2 seconds
- Queue pickup: 1-15 seconds
- PDF render + local write: 2-20 seconds
- Dual-write branch decision + telemetry: immediately after local write
- R2 upload (if allowed): usually sub-second to a few seconds
- Job completion: commonly under 60 seconds

If beyond 120 seconds, investigate queue backlog/worker availability before retry.

---

## 6) Canary Behavior Explanation

Canary decision happens per job in writeArtifactWithDualUpload:

- mode=disabled: all eligible jobs allowed
- mode=job-percentage: random threshold against R2_CANARY_PERCENTAGE
- mode=job-count: first N jobs allowed per process session

At 5% percentage mode, one single test job may be skipped by design. That is not a defect if dual_write_canary_skip is present.

---

## 7) Troubleshooting Matrix

| Symptom | Likely cause | Evidence to check | Operator action |
|---|---|---|---|
| No dual-write events after test | Preview endpoint used | Request path shows /api/jobs/preview/labels | Re-run using /api/jobs/upload |
| No telemetry in Railway logs | Sink file-only | telemetry_sink_initialized shows sink=file | Set TELEMETRY_STDOUT_DUPLICATE=true and redeploy |
| Startup crash after deploy | Guard violation | Startup error for NORMALIZED_KEYS and DUAL_KEY_LOOKUP_ENABLED | Set DUAL_KEY_LOOKUP_ENABLED=true and redeploy |
| dual_write_start present but no success/skip | Log capture incomplete or process interruption | Filter by exact jobId, check worker logs | Re-capture full window, verify worker health |
| dual_write_canary_skip observed | Expected at 5% canary | canary mode and percentage in startup event | Accept as valid Phase 10D result |
| dual_write_failure observed | R2 upload failure | dual_write_failure error field | Hold rollout, investigate R2 path/credentials/connectivity |

---

## 8) Rollback Triggers (Phase 10D Execution Window)

Immediate HOLD/rollback readiness escalation if any occur during this verification:

- Startup Error events after deployment
- dual_write_failure recurring for the single test job attempts
- r2TimeoutCounter critical threshold breach (>10 in 15 min)
- Any process exit loop indicating config contradiction

This runbook does not change rollback commands. Use existing Phase 1 rollback procedure.

---

## 9) Safe Retry Procedure

1. If first single job is canary-skipped, run one additional single job only
2. Maintain one-at-a-time submissions
3. Capture logs per jobId
4. Stop once one successful allowed path is observed (dual_write_success) or after two safe attempts with explicit skips
5. If failures appear, HOLD and investigate before any further retries

---

## 10) Evidence Checklist

Mark complete only when all required evidence exists:

- [ ] telemetry_sink_initialized visible
- [ ] canary_runtime_configuration visible
- [ ] POST /api/jobs/upload used (not preview)
- [ ] job transitions QUEUED -> PROCESSING -> COMPLETED
- [ ] dual_write_start visible for test jobId
- [ ] object_key_version_logged visible for test jobId
- [ ] dual_write_success or dual_write_canary_skip visible for test jobId

---

## 11) Classification Template

VERIFIED:
- __________________________________________

NOT OBSERVED:
- __________________________________________

INCONCLUSIVE:
- __________________________________________

Decision (choose one):
- SAFE TO REMAIN AT 5%
- SAFE TO MOVE TO 25%
- HOLD
- ROLLBACK REQUIRED

---

## 12) Phase 10F Forensic Branch (When Real Job Runs but Telemetry Is Missing)

If real-job evidence exists (`POST /api/upload`, worker processing, PDF generation, job completion)
but structured telemetry events are missing, perform this forensic sequence:

1. Verify live env on API and Worker:
  - `railway variables`
  - `railway variables --service Worker`

2. Confirm canary + telemetry visibility flags exist:
  - `STAGING_R2_ENABLED`
  - `ENABLE_DUAL_WRITE`
  - `ENABLE_R2_UPLOADS`
  - `ENABLE_DUAL_READ`
  - `NORMALIZED_KEYS_FOR_NEW_UPLOADS`
  - `DUAL_KEY_LOOKUP_ENABLED`
  - `R2_CANARY_MODE`
  - `R2_CANARY_PERCENTAGE`
  - `TELEMETRY_STDOUT_DUPLICATE`

3. Confirm deployment/runtime alignment:
  - Compare live log signatures against current code signatures
  - Example drift indicator: live logs show `Job added:` while current code expects `Job added (filePath):`

4. Confirm startup telemetry events after deploy:
  - `telemetry_sink_initialized`
  - `canary_runtime_configuration`

### Phase 10F Root-Cause Decision Rule

- If flags are missing and startup telemetry events are absent: treat as env/deployment mismatch.
- If flags are present but sink is `file` only: set `TELEMETRY_STDOUT_DUPLICATE=true`.
- If startup telemetry appears but dual-write events do not: inspect canary skip path and dual-write gates.

### Safe Remediation Order

1. Fix env flags on API + Worker
2. Deploy latest build (`railway up`)
3. Re-run one real upload test only
4. Capture required event chain

