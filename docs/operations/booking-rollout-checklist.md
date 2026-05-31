# Booking Rollout Checklist (Phase 2B Persisted Draft Request)

## Pre-Deploy
- Confirm protected modules are untouched: upload/generation, worker, billing, admin, tracking.
- Confirm no DB migration is included for this rollout.
- Confirm quote endpoint returns quote-only response mode.
- Confirm persisted draft path writes only request-only draft records.
- Confirm no payment/live-booking/pickup execution is introduced.

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
- Verify recommendation cards render after quote summary.
- Verify request preview renders with request-only, no-payment, no-live-booking, and no-pickup notices.
- Verify customer must accept request-only notice before draft creation is enabled.
- Verify draft creation from quote preview succeeds and returns a booking in `BOOKING_DRAFT`.
- Verify success path links to existing booking detail page.

## Safety Checks
- Ensure Phase 2B create flow creates only booking draft request records.
- Ensure quote flow does not trigger payments.
- Ensure quote flow does not touch label or money-order generation paths.
- Ensure no pickup/dispatch/live courier/live Pakistan Post booking action is triggered.

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

## Phase 2A Implementation Status (2026-05-31)
- Added deterministic recommendation engine service for rules evaluation.
- Added Booking Quote request-preview UI components with no DB write.
- Added request-only notices and disabled Phase 2B submit action.
- Kept quote input/upload and per-article postage behavior unchanged.

## Phase 2B Implementation Status (2026-05-31)
- Enabled persisted quote-to-draft request creation from Booking Quote preview.
- Added mandatory customer notice acceptance gate before draft creation.
- Added request-only payload validation and blocker enforcement (`OVER_PHASE_LIMIT` rejection).
- Persisted request metadata snapshot through existing aggregator persistence path without migration.
- Kept create status as `BOOKING_DRAFT` and avoided payment/pickup/dispatch/live booking side effects.

## Phase 2B Smoke Result (2026-05-31)
- Preflight identity: PASS (`origin` points to `https://github.com/emttspk/emtts.git`, branch `main`, clean status before smoke work).
- Build/lint/typecheck: PASS.
- Schema smoke: PASS (`convertQuoteToDraftSchema` accepted valid request and rejected `customerNoticeAccepted: false`).
- Service smoke: PASS (stubbed conversion returned `BOOKING_DRAFT`, preserved request-only flags, sender details, quote snapshot, recommendation snapshot, and items).
- Local DB probe: PASS.
- Local DB-backed draft create/read smoke: BLOCKED by missing `public.AggregatorBooking` table in the current local database.
- Frontend browser smoke: local preview opened `/login` for `/booking-quote`, so the protected Booking Quote screen was not reachable without auth.
- Source-level UI smoke: PASS for request-only disclaimers and the disabled/unavailable create gate until acceptance and sender details are complete.
- Protected scope confirmation: no Upload flow, worker, PDF templates, billing, tracking, complaints, auth core, admin core auth, storage/R2, cleanup flags, Railway, Cloudflare/R2, or production paths were touched.

## Local DB Drift Repair and DB-Backed Smoke (2026-05-31)
- Local Prisma migrate status: PASS target remained local PostgreSQL on `localhost:5432`; pending migrations were present before repair.
- Migration drift cause: `20260530154500_add_complaint_queue_table` existed as a failed/partial `_prisma_migrations` row because `ComplaintQueue` already existed locally.
- Local resolve action: PASS `npm --workspace=@labelgen/api exec prisma migrate resolve --applied 20260530154500_add_complaint_queue_table`.
- Local migrate deploy: PASS `npm --workspace=@labelgen/api exec prisma migrate deploy` applied the remaining migrations.
- Aggregator tables verified locally: PASS (`AggregatorQuote`, `AggregatorBooking`, `AggregatorBookingItem`, `AggregatorBookingStatusEvent`, `AggregatorBookingAuditLog`).
- DB-backed smoke: PASS using fake sender data and local test user.
- Created booking status: `BOOKING_DRAFT`.
- Customer list visibility: PASS.
- Admin list visibility: PASS.
- Side effects: no payment, pickup, dispatch, courier API, or Pakistan Post side effect was triggered in the local smoke.
- Safety confirmation: no Railway, Cloudflare/R2, or production touch occurred; protected scope remained untouched.

## Phase 3A Admin Review Hardening (2026-05-31)
- Admin approve semantics: hardcoded as manual-action approval only (not final booking confirmation).
- Admin reject validation: reason code required.
- Admin correction validation: reason code required.
- Admin approve validation: manual-action confirmation note required.
- Admin UI guardrails: explicit non-live operational constraints are displayed.
- Customer wording: status/timeline language clarified for manual-review lifecycle.
- Audit clarity: admin decision actions and rationale payloads are now explicit in audit logs.
- Side-effect safety: no live payment collection, no pickup/dispatch execution, no external courier/Pakistan Post API call introduced.
- Schema safety: no Prisma schema change and no migration change.
- Platform safety: no Railway, Cloudflare/R2, or production touch.

## Remaining Phase 3 Work
- Phase 3B: rollout controls, approval matrix hardening, and rollback trigger automation.
- Phase 3C: monitoring/telemetry operationalization and canary-readiness criteria.
- Keep rollout limited to non-protected booking paths and manual-only semantics until separately approved.
