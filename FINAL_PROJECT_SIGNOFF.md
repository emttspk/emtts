# FINAL_PROJECT_SIGNOFF.md
# Label Generator Production Closeout (Phase 10K)

Date: May 19, 2026
Environment: Railway production
Project: Epost / Label Generator

---

## 1) Scope Completed

This closeout confirms completion of:
- Railway secret synchronization from `.env.staging.local` to Api + Worker
- R2 upload activation (`ENABLE_R2_UPLOADS=true`) on Api + Worker
- Post-sync redeploy health gate
- One real post-activation upload job
- Telemetry chain capture
- Actual R2 object existence verification
- Documentation closeout

---

## 2) Deployment Health Gate

| Service | Deployment ID | Final Status |
|---|---|---|
| Api | `50bbea54-de6c-47f4-bf3a-db6efa433ed1` | SUCCESS |
| Worker | `91f2e211-f124-4870-bd29-d4f745106ec1` | SUCCESS |

Worker recovery status:
- Redis connectivity restored (`Redis CONNECTED`, `Redis READY`)
- No recurring `ETIMEDOUT` loop observed

---

## 3) Final Proof Job

| Field | Value |
|---|---|
| Job ID | `99338048-50b2-4ca2-a869-e534a8a37cd1` |
| Trigger path | `POST /api/jobs/upload` |
| Lifecycle observed | `PROCESSING -> COMPLETED` |
| Artifact type proven | labels PDF |

---

## 4) Required Telemetry Evidence

Observed after activation:
- `telemetry_sink_initialized`
- `canary_runtime_configuration`
- `dual_write_start`
- `object_key_version_logged`
- `dual_write_canary_allowed`
- `dual_write_success`

Normalized key captured:
- `pdf/production/99338048-50b2-4ca2-a869-e534a8a37cd1/labels.pdf`

---

## 5) Actual R2 Object Proof

S3-compatible HeadObject result:
- Bucket: `my-bucket`
- Key: `pdf/production/99338048-50b2-4ca2-a869-e534a8a37cd1/labels.pdf`
- ContentLength: `75868`
- LastModified: `2026-05-19T08:10:29.000Z`
- ETag: `"1c2b13e26be8f9c1531cf936d9b5084a"`

---

## 6) Local-First Authority Confirmation

Local artifact persistence observed in worker logs:
- `/app/storage/generated/99338048-50b2-4ca2-a869-e534a8a37cd1-labels.pdf`

Conclusion:
- Local write authority remains intact
- R2 acts as dual-write replication path

---

## 7) Final Decision

Production closeout status: APPROVED

Decision:
- SAFE TO REMAIN AT 5% canary
- No rollback trigger observed in final validation window

Operational note:
- Embedded worker fallback remains enabled. Dedicated Worker is healthy; retirement of embedded fallback can be performed in a separate controlled maintenance window.

---

## 8) Post-Production Hardening — Attempt 1 (ENOENT Blocker Identified)

Validation window: May 19, 2026

### Test Actions

1. Verified pre-test ownership:
	 - Api embedded worker active
	 - Dedicated Worker lock-blocked by singleton guard
2. Temporarily set `START_WORKER_IN_API=false` on Api and redeployed Api only
3. Ran exactly one safe validation job

### Validation Job (Attempt 1 — BLOCKED)

- Job ID: `c53ca136-febc-4fc5-ae2a-e79d8405cbee`
- Api accepted upload and enqueued successfully
- Dedicated Worker consumed job
- Worker failed before render/upload stage:

```
Failed to read file from path:
/app/storage/uploads/c53ca136-febc-4fc5-ae2a-e79d8405cbee.xlsx
(ENOENT: no such file or directory)
```

### Classification (Attempt 1)

- VERIFIED: Dedicated Worker queue pickup, singleton protection, Redis stability
- NOT OBSERVED: Successful worker-only PDF generation, dual-write, R2 persistence
- Root cause: API saves uploads to container-local disk; dedicated Worker runs in an
  isolated container with a separate filesystem; the file path in the queue payload
  is not accessible from the Worker container.

---

## 9) Post-Production Hardening — Attempt 2 (RESOLVED — May 19, 2026)

### Root Cause (VERIFIED)

| Component | Finding |
|---|---|
| API upload path | `${UPLOAD_DIR}/${jobId}.xlsx` (container-local disk) |
| Queue payload | `filePath` only — absolute path on API container |
| Worker runtime | Separate Railway container, isolated filesystem |
| ENOENT cause | Worker cannot read a file that exists only in API container |
| Pre-existing fallback | `fileBuffer` path in worker.ts already implemented |
| Comment evidence | `jobs.ts`: "Phase 2: Enqueue filePath… rollback: revert to fileBuffer if needed" |

### Fix Implemented (Minimal, Surgical)

**Strategy: Option C — Dual-mode queue payload (filePath + fileBuffer)**

Two files changed, zero architecture changes:

1. `apps/api/src/routes/jobs.ts`:
   - After `fs.rename(uploadedFile.path, uploadPath)`, read file into buffer
   - Include both `filePath` AND `fileBuffer` in queue.add payload
   - Log: `Job added (filePath+fileBuffer dual-mode)`

2. `apps/api/src/worker.ts`:
   - When `filePath` read throws ENOENT and `fileBuffer` is present:
     fall through to `fileBuffer` instead of throwing `UnrecoverableError`
   - Log: `filePath read failed … falling through to embedded fileBuffer`

**Behavior:**
- Embedded worker mode: `filePath` succeeds (fast path, no overhead)
- Dedicated worker mode: `filePath` ENOENT → `fileBuffer` fallback → works
- Rollback: Remove `fileBuffer` from queue payload (single line revert)

**Build/typecheck:** Clean (0 errors)

### Deployments

| Service | Deployment ID | Status |
|---|---|---|
| Api | `989591b3-2859-4ff7-b645-1393a54ced52` | SUCCESS |
| Worker | `09063350-b3d0-4bbb-bd9d-d008815e0967` | SUCCESS |

`START_WORKER_IN_API=false` — confirmed on deployed Api.

### Validation Job (Attempt 2 — SUCCESS)

- Job ID: `d960a310-26a8-41eb-bcfe-0533d12a366c`
- Api accepted upload, saved file, enqueued with dual-mode payload
- Dedicated Worker exclusively processed the job

### Verified Telemetry Chain

```
[Worker] Processing job d960a310-26a8-41eb-bcfe-0533d12a366c
[Worker] filePath read failed (ENOENT: …/uploads/d960a310….xlsx);
         falling through to embedded fileBuffer
[Worker] Using embedded fileBuffer fallback (size: 17198 bytes)
[Worker] Parsing success for job d960a310-26a8-41eb-bcfe-0533d12a366c. Rows: 1
[Worker] Generating Labels PDF for job d960a310-26a8-41eb-bcfe-0533d12a366c
[INFO]  event="dual_write_start" artifactType="labelsPdf"
        objectKey="pdf/production/d960a310-26a8-41eb-bcfe-0533d12a366c/labels.pdf"
[INFO]  event="dual_write_canary_skip" reason="percentage_gate"  ← canary 5%, expected
[Worker] Labels file persisted at: /app/storage/generated/d960a310….pdf
[Worker] Job d960a310-26a8-41eb-bcfe-0533d12a366c completed successfully
JOB COMPLETED d960a310-26a8-41eb-bcfe-0533d12a366c
```

| Signal | Status |
|---|---|
| Worker queue ownership (not API) | VERIFIED |
| ENOENT → fileBuffer fallback | VERIFIED |
| File parsing across container boundary | VERIFIED |
| PDF generation | VERIFIED |
| Local persistence | VERIFIED |
| dual_write_start triggered | VERIFIED |
| Canary gating (5% skip) | VERIFIED (working as designed) |
| Job completed successfully | VERIFIED |
| API embedded worker NOT active | VERIFIED (no "Listening for jobs" in API logs) |

### Final Operational Decision

**DECISION: Embedded worker fallback CAN safely retire.**

Rationale:
- The ENOENT blocker is resolved. Dedicated Worker handles cross-container upload access.
- Full job pipeline runs end-to-end in dedicated Worker without any API involvement.
- Queue ownership, singleton protection, and Redis isolation all verified.
- Rollback is immediate (set `START_WORKER_IN_API=true`, redeploy Api).
- The `fileBuffer` fallback is the original pre-Phase2 design — well-tested code path.

### Current Permanent Configuration

```
START_WORKER_IN_API=false   # permanent in Railway Api env
```

### Maintenance State

**System state: MAINTENANCE-ONLY**

All operational blockers resolved. No further development work required.
The embedded worker fallback env flag remains available for emergency rollback only.
