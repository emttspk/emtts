# Rollback Trigger Matrix

| Condition                        | Action           |
|----------------------------------|------------------|
| >1 job fails in canary window    | Rollback        |
| Any R2 upload/download error     | Rollback        |
| Queue depth >15                  | Rollback        |
| Redis disconnect/error           | Rollback        |
| Worker crash/unhandled error     | Rollback        |
| Telemetry >2x baseline           | Rollback        |
| Any active file deletion         | Rollback        |
| Operator exceeds job/queue limit | Rollback        |

**Operator must document all rollback events and escalate if repeated.**
