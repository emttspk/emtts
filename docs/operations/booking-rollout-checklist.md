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

## Latest Smoke Result (2026-05-30)
- Preflight identity: PASS (`main`, correct remote, clean working tree before smoke run).
- Route wiring:
	- Web route `/booking-quote`: PASS
	- API route `/api/booking-quotes/quote`: PASS
- Build: PASS
- Lint: PASS
- Typecheck: PASS
- Direct postage test (`npm exec --workspace=@labelgen/api tsx src/utils/postageRates.test.ts`): PASS (7/7)
- API quote contract smoke: PASS (service-level verification via `buildBookingQuoteSummary` with sample rows)
	- Confirmed keys: `totalArticles`, `totalActualWeightGrams`, `totalChargeableWeightGrams`, `totalPostageAmount`, `byCategory`, `byProduct`, `perArticlePostageBreakdown`, `warningRows`, `errorRows`
	- Sample postage checks: RGL 20g=30, UMS local 250g=90, UMS city-to-city 501g=305, PAR 1000g=150
	- Invalid row (missing weight) remained diagnostics-only in `errorRows`
- Frontend smoke:
	- Local web runtime started successfully.
	- Navigating to `/booking-quote` redirected to `/login` under auth guard as expected.
	- Booking Quote component text remains quote-only and non-booking.
- Safety assertions:
	- No payment/pickup/discount/live-booking action introduced in Phase 1 quote flow.
	- Existing Upload and generation flow remained unchanged.
