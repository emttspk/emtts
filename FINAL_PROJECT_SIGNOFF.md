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

---

## 10) Canary Expansion Validation (25% -> 50%) — May 19, 2026

### Configuration and Deployments

| Service | Deployment ID | Status | Canary Percentage |
|---|---|---|---|
| Api | `4ebcea29-fa1b-46c6-97c5-3c13149267f5` | SUCCESS | 50 |
| Worker | `fdd4d715-9953-45bb-944e-58a760272e5b` | SUCCESS | 50 |

Worker runtime evidence after deployment:
- `event="canary_runtime_configuration" ... mode="job-percentage" percentage=50`

### Validation Traffic Executed

Because the original debug account entered lockout/invalid-credential state, validation was executed through smoke automation that produced real uploaded jobs and full worker processing.

Validated job IDs (11):
- `01aba4ce-55d5-4b41-995f-8949e8d22883`
- `5506d431-2ddf-44c8-bf62-21e3d1e02ad9`
- `6a7cb98b-97e5-450d-b31a-1f84aa5fc53b`
- `32b97683-5462-4837-9c9b-bb8291a6b92c`
- `a89c313f-ca5f-4312-9db1-1e22f81ba570`
- `055064a8-ac5d-4c24-ab37-1cc1772a7f1b`
- `5138b08b-a284-4b57-aea2-359d615ca720`
- `2e51d346-cf39-455a-a8b3-7a914b2d8220`
- `7f5af1b0-a517-4388-b1cb-ad4f3e14e887`
- `95b5ee79-ce2d-498c-bc11-f2db08de1e14`
- `c1246655-f905-40c2-8e00-0ea3a6b161c9`

### Telemetry Summary (Worker)

Observed across validation window:
- `JOB COMPLETED`: 11/11
- `dual_write_canary_allowed`: 4/11
- `dual_write_canary_skip` (percentage gate): 7/11
- `dual_write_success`: 4/4 allowed jobs
- `r2_upload_failed`: 0 observed

Worker stability signals:
- Dedicated Worker processed all jobs end-to-end.
- ENOENT on container-local `filePath` occurred as expected in worker-only topology.
- `fileBuffer` fallback engaged and completed successfully for each affected job.
- No job-level crash or terminal worker failure observed in the sampled validation set.

### API Retrieval Observation (New Blocker)

For the same completed jobs, smoke validation repeatedly observed:

```
PDF download failed (404): {"success":false,"message":"File not found on disk"}
```

Correlated API logs indicate repeated dual-read fallback attempts (`event="dual_read_fallback"`) and compatibility lookup bypass, while `/api/jobs/{id}/download/labels` returns not found.

### Operational Decision at 50%

Status: CONDITIONAL PASS (PROCESSING PATH ONLY)

What is validated:
- 50% canary gating runtime is active and functioning.
- Dedicated Worker processing path is stable.
- Dual-write to R2 succeeds when canary allows.

What is not validated / currently blocked:
- Reliable API label retrieval path (`/download/labels`) for completed jobs.

### 100% Rollout Readiness

Decision: NOT READY for 100% canary rollout.

Reason:
- Customer-visible retrieval regression risk remains (`download/labels` 404 after completed jobs).

Required next gate before 100%:
1. Fix API artifact lookup/read path so completed jobs are downloadable.
2. Re-run validation (minimum 10 jobs) and confirm:
  - `JOB COMPLETED` for all
  - successful label download for all
  - expected canary distribution and `dual_write_success` on allowed cohort
3. Re-issue final 100% GO/NO-GO signoff.

---

## 11) Download Path Resolution Hardening — Final Closure (May 19, 2026)

### Forensic Classification

VERIFIED:
- Worker completed jobs were writing labels to worker-local disk and, when canary-allowed, replicating to R2 under normalized keys: `pdf/production/{jobId}/labels.pdf`.
- API download fallback was probing R2 using the worker-local stored path shape (`generated/{jobId}-labels.pdf` semantics) instead of the normalized R2 key fragment derived from `jobId + artifactType`.
- This caused deterministic `404 File not found on disk` for completed jobs even when the R2 object existed.
- After the code fix, API fallback probes `production/{jobId}/labels.pdf` and streams successfully from R2.
- The remaining 404s observed during 50% validation were all on `dual_write_canary_skip` jobs. Those jobs had no R2 replica, and API could not access worker-local disk in dedicated-worker topology.

NOT OBSERVED:
- No evidence of early cleanup removing artifacts during the validation window.
- No `r2_upload_failed` during final 100% validation.
- No worker crash or job failure in final validation cohort.

INCONCLUSIVE:
- None required for rollout decision. The retrieval failure mode is sufficiently explained by verified lookup mismatch plus canary-skip behavior.

### Minimal Safe Fix Implemented

File changed:
- `apps/api/src/storage/paths.ts`

Operational change:
- Local-first behavior remains unchanged.
- When local artifact resolution fails and metadata is available (`jobId`, `artifactType`), API now probes R2 using the normalized key fragment instead of the worker-local stored path.

Rollback:
- Immediate code rollback to previous Api deployment.
- No schema, queue, worker-isolation, cleanup, or canary-framework changes were required.

### Build / Type Validation

Executed successfully:
- `npm run build --workspace=@labelgen/api`
- `npm run typecheck --workspace=@labelgen/api`

### 100% Rollout Activation

| Service | Deployment ID | Status | Runtime |
|---|---|---|---|
| Api | `73754e3a-f187-4855-8af4-3cdc41475ce5` | SUCCESS | 100% |
| Worker | `ae8f77c5-ba5f-4b49-8fce-88b6efc62d6f` | SUCCESS | 100% |

Worker runtime confirmation:
- `event="canary_runtime_configuration" ... percentage=100`

### Final Validation Jobs (100% Rollout)

Validated jobs (10/10 successful):
- `2b37df53-9e9a-45b8-b2e5-8079815a21b9`
- `c239a2b6-ab0d-4f54-86eb-dfa15a6c8d59`
- `d76e0667-2140-44fb-a6ec-b035b6d1ba20`
- `7bb62edf-686a-44be-bf9d-f06779c477f8`
- `8b1f85f6-d240-4b03-9abe-af8142cd147f`
- `5a4bff2f-9889-415a-9986-fcc540e9aadc`
- `64dc71e6-e98a-4db8-9384-3ea62d7faf58`
- `e27fb499-bac5-46f7-9028-a0868358e802`
- `9ae1450e-a782-4d16-b9c4-c2b7d878fb4e`
- `9359cd62-020a-4724-90b0-aaecdf25e6da`

Validated for each job:
- completion
- PDF generation
- worker-local persistence
- dual-write success
- API download success
- no `404 File not found on disk`

### Final Telemetry Outcome

Observed during final validation:
- `dual_write_canary_allowed`: all validated jobs
- `dual_write_success`: observed across final cohort
- `dual_read_fallback` -> `provider_fallback=r2` -> `stream_success`
- `stream_failure`: not observed in final cohort
- `stream_timeout`: not observed in final cohort
- `r2_upload_failed`: not observed in final cohort

Cleanup race assessment:
- No telemetry evidence of cleanup racing successful downloads during the final validation window.

### Repository Documentation Normalization

Structured docs folders created:
- `docs/architecture/`
- `docs/operations/`
- `docs/rollout/`
- `docs/forensics/`

Stable docs were moved from the flat `docs/` layout into those folders and internal references were updated.

Additional cleanup:
- `.env.staging.local.example` scrubbed back to placeholders
- `.gitignore` hardened for transient backups/temp artifacts while preserving operational docs

### Final Decision

Production closeout status: APPROVED

Decision:
- 100% rollout is now safe.

Reasoning:
- Retrieval lookup defect is fixed.
- 100% rollout removes the canary-skip cohort that could not be served under dedicated-worker/local-only authority.
- 10/10 final validation jobs completed and downloaded successfully.
- Rollback remains immediate through prior Railway deployments.
