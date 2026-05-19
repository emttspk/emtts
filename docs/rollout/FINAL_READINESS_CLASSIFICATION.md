# Final Readiness Classification — May 18, 2026

## 1. Exact Safe Concurrency Limits
- Max concurrent jobs: 3 (recommended), 5 (absolute ceiling)

## 2. Exact Queue Depth Limits
- Max queue depth: 10 (recommended), 15 (NO-GO)

## 3. Exact Worker Concurrency Recommendations
- Worker concurrency: 1 per process/queue
- Max 1 worker process per queue type

## 4. Exact Telemetry Baseline Ranges
- Upload latency: 1–5s (normal), warning >8s, rollback >15s
- Queue wait: 0–3s (normal), warning >5s, rollback >10s
- Worker processing: 2–10s (normal), warning >15s, rollback >30s
- R2 upload: 0.5–2s (normal), warning >4s, rollback >8s
- Cleanup: <10s (normal), warning >30s, rollback >60s
- Startup validation: <3s (normal), warning >6s, rollback >10s
- Semaphore contention: 0 (normal), warning >2, rollback >5

## 5. Exact Rollback Thresholds
- >1 job fail, any R2 error, queue >15, Redis/worker error, telemetry >2x baseline

## 6. Exact Cleanup Guarantees
- Cleanup only deletes files confirmed synced to R2 or not tracked
- No active file deletion risk
- If DB check fails, file is NOT deleted

## 7. Exact Retry-Safety Guarantees
- Retries: 2 (tracking), 1 (label)
- Backoff: exponential, capped at 60s
- Singleton/global locks prevent duplicate jobs
- Orphan cleanup: Only after R2 sync
- Redis reconnect: auto-retry, logs ECONNREFUSED/ECONNRESET

## 8. Exact Redis Operational Findings
- Redis 7 (Docker, port 6380)
- Connection errors logged and retried
- No downgrade risk

## 9. Exact Docker Operational Findings
- Docker Compose enforces Redis 7 and Postgres 16
- All infra validated via npm run infra:check

## 10. Exact Operator Workflow
- Operator-only, max 3–5 jobs in canary window
- Observe telemetry for each job
- If any warning/rollback threshold hit, STOP and rollback
- Validate cleanup after each job
- Record all events in canary log

## 11. Exact Escalation Workflow
- See ../operations/operational-escalation-checklist.md

## 12. Exact Docs Updated
- docs/forensics/archive/MULTI_JOB_CANARY_PLAN.md
- docs/telemetry-thresholds.md
- docs/rollback-trigger-matrix.md
- docs/operations/operational-escalation-checklist.md

## 13. Exact Remaining Risks
- Redis outage during job
- R2 transient error
- Operator error (exceeding limits)
- Unobserved queue growth

## 14. Exact Final Recommendation

**READY FOR LIMITED MULTI-JOB CANARY**

All ceilings, thresholds, rollback triggers, and operator procedures are defined. Operator-only, strictly limited rollout is safe. No public or batch rollout permitted. All operational docs updated.
