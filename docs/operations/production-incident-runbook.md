# Production Incident Runbook - Prisma Migration Repair Verification

## Date
- 2026-05-31

## Services Affected
- Api (production deployment startup)
- Worker (production deployment startup)

## Incident
- Prisma deployment startup was blocked with `P3009` at migration `20260530154500_add_complaint_queue_table`.

## Root Cause
- `_prisma_migrations` contained a failed state for `20260530154500_add_complaint_queue_table` while the underlying `ComplaintQueue` database objects already existed.

## Evidence Collected
- Migration metadata showed prior failure due to relation already existing.
- Production DB object audit confirmed expected migration objects existed:
  - `ComplaintQueue` table
  - required columns
  - required indexes
  - `ComplaintQueue_userId_fkey`

## Resolve Action
- Used Prisma migration-state recovery flow after object-existence verification.
- Marked migration as applied in production runtime context.
- Executed `prisma migrate deploy` and then verified status.

## Verification Commands and Outcomes
- `prisma migrate status --schema=apps/api/prisma/schema.prisma`
  - Result: database schema is up to date.
- `prisma validate --schema=apps/api/prisma/schema.prisma`
  - Result: schema valid.
- Api latest deployment status
  - Result: `SUCCESS` (`7b8198b1-2fcb-4301-bddc-4f697abe7c2e`).
- Worker latest deployment status
  - Result: `SUCCESS` (`d7657378-ce26-4681-8fcd-b70bc9d99948`).
- Api health endpoint
  - `https://api.epost.pk/api/health` returned `200`.

## Fresh Deployment Log Check
- Checked latest deployment logs for both Api and Worker.
- No active failures detected for:
  - `P3009`
  - `P2021`
  - `P2022`
  - `P1001`
  - `P1002`
  - `P3005`
  - Redis/BullMQ startup failure patterns
  - module/import failures
  - missing-env startup failures
  - restart-loop symptoms
  - port binding errors

## Safety and Control Confirmation
- No code logic changed for this incident verification task.
- No destructive SQL executed.
- No table drops, resets, or `prisma migrate reset`.
- No Cloudflare/R2 operations were performed.
- No secrets were exposed.
- Protected Scope Protocol preserved.

## Prevention Note
- Verified repository migration file exists and is tracked:
  - `apps/api/prisma/migrations/20260530154500_add_complaint_queue_table/migration.sql`
- This check is mandatory to reduce future deploy artifact mismatch risk.
