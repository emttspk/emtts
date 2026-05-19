# Telemetry Thresholds Table

| Metric                  | Normal   | Warning | Rollback |
|-------------------------|----------|---------|----------|
| Upload latency (s)      | 1–5      | >8      | >15      |
| Queue wait (s)          | 0–3      | >5      | >10      |
| Worker proc. (s)        | 2–10     | >15     | >30      |
| R2 upload (s)           | 0.5–2    | >4      | >8       |
| Cleanup (s)             | <10      | >30     | >60      |
| Startup validation (s)  | <3       | >6      | >10      |
| Semaphore contention    | 0        | >2      | >5       |

**Warning:** Any metric >2x baseline triggers operator review.
**Rollback:** Any metric >3x baseline or >1 error in canary triggers rollback.
**Escalation:** Any unhandled error, Redis disconnect, or queue depth >15.
