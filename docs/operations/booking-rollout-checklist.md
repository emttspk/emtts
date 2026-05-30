# Booking Rollout Checklist (Phase 1 Quote-Only)

## Pre-Deploy
- Confirm protected modules are untouched: upload/generation, worker, billing, admin, tracking.
- Confirm no DB migration is included for this rollout.
- Confirm quote endpoint returns quote-only response mode.

## Verification Commands
- Run `npm run build`
- Run `npm test -- --runInBand postageRates`
- Run `npm run lint`
- Run `npm run typecheck`

## Functional Checks
- Upload CSV with valid rows and confirm totals/warnings/errors are returned.
- Upload XLSX with valid rows and confirm same output shape.
- Submit JSON rows and confirm output matches file-mode behavior.
- Verify unsupported slab rows show explicit error diagnostics.

## Safety Checks
- Ensure quote flow does not create booking records.
- Ensure quote flow does not trigger payments.
- Ensure quote flow does not touch label or money-order generation paths.

## Rollback Plan
- Revert Phase 1 quote module commit if critical regression appears.
- Re-run verification commands.
- Confirm legacy upload/generation behavior remains unchanged.

## Cross-Reference
For phase boundaries, protected scope, and continuity handoff protocol, see `docs/architecture/booking-business-plan.md`.
