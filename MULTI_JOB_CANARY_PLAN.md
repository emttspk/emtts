# MULTI_JOB_CANARY_PLAN.md

## Controlled Multi-Job Canary Rollout Plan (May 2026)

### Strict Execution Rules
- NO dual-read
- NO R2 as primary
- NO removal of local-first authority
- NO stress/batch testing
- NO exceeding canary ceilings
- Rollback readiness at all times
- Strict startup validation gates enforced

---

## Phase 1: Safety Ceilings & NO-GO Thresholds
- Max concurrent jobs: 3 (recommended), 5 (absolute ceiling)
- Max queue depth: 10 (recommended), 15 (NO-GO)
- Max upload rate: 1 job/min/operator, NO-GO >3/min
- R2 upload concurrency: 1 per worker
- Worker concurrency: 1 per process/queue
- Cleanup: Only deletes files confirmed synced to R2 or not tracked
- Rollback triggers: >1 job fail, any R2 error, queue >15, Redis/worker error, telemetry >2x baseline

## Phase 2: Queue & Worker Resilience
- BullMQ concurrency: 1
- Retries: 2 (tracking), 1 (label)
- Backoff: exponential, capped at 60s
- Singleton/global locks prevent duplicate jobs
- Orphan cleanup: Only after R2 sync
- Redis reconnect: auto-retry, logs ECONNREFUSED/ECONNRESET
- No retry storm/queue corruption risk

## Phase 3: Telemetry Baselines
| Metric                  | Normal   | Warning | Rollback |
|-------------------------|----------|---------|----------|
| Upload latency (s)      | 1–5      | >8      | >15      |
| Queue wait (s)          | 0–3      | >5      | >10      |
| Worker proc. (s)        | 2–10     | >15     | >30      |
| R2 upload (s)           | 0.5–2    | >4      | >8       |
| Cleanup (s)             | <10      | >30     | >60      |
| Startup validation (s)  | <3       | >6      | >10      |
| Semaphore contention    | 0        | >2      | >5       |

## Phase 4: Operator Procedure
- Only operator-initiated jobs (no public/batch)
- Max 3–5 jobs in canary window
- Observe telemetry for each job
- If any warning/rollback threshold hit, STOP and rollback
- Validate cleanup after each job
- Record all events in canary log

## Phase 5: Cleanup & Retention
- Cleanup only deletes files confirmed synced to R2
- No active file deletion risk
- If DB check fails, file is NOT deleted
- Retention: 7–30 days (configurable)

## Phase 6: Escalation & Rollback
- Immediate rollback if any NO-GO/rollback threshold hit
- Escalate to lead/operator if >1 job fails, Redis/worker error, or queue >15
- Document all incidents in canary log

## Phase 7: Final Readiness
- READY FOR LIMITED MULTI-JOB CANARY if all above are true
- HOLD FOR ADDITIONAL HARDENING if any risk/threshold breached

---

## Operator Checklist
- [ ] Confirm infra/DB/Redis healthy
- [ ] Confirm strict validation gates pass
- [ ] Submit 1 job, observe telemetry
- [ ] If normal, submit up to 3 jobs (max 5)
- [ ] Monitor queue, worker, R2, cleanup, telemetry
- [ ] If any warning/rollback, STOP and rollback
- [ ] Document all results

---

## Remaining Risks
- Redis outage during job
- R2 transient error
- Operator error (exceeding limits)
- Unobserved queue growth

---

## Final Recommendation
**READY FOR LIMITED MULTI-JOB CANARY**

All ceilings, thresholds, and rollback triggers are defined. Operator-only, strictly limited rollout is safe. No public or batch rollout permitted.
