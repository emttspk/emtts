# Operational Escalation Checklist

## When to Escalate
- >1 job fails in canary window
- Any R2 upload/download error
- Queue depth >15
- Redis disconnect/error
- Worker crash/unhandled error
- Telemetry >2x baseline
- Any active file deletion
- Operator exceeds job/queue limit

## Escalation Steps
1. Immediately STOP all new job submissions
2. Rollback to local-only mode
3. Notify lead/operator
4. Document incident in canary log
5. Review logs and telemetry for root cause
6. Do not resume canary until risk is resolved

## Documentation
- Record all escalation events in canary log
- Update MULTI_JOB_CANARY_PLAN.md with findings if new risk is discovered
