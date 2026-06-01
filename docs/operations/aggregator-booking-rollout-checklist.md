# Aggregator Booking Rollout Checklist

## Phase 1 Checklist
- Separate booking quote API route is isolated from existing upload route.
- Separate Booking Quote page is available for authenticated users.
- Postage quote engine validates missing/invalid/unsupported rows.
- Quote output includes summary, by-category/product buckets, and per-row diagnostics.
- Existing upload/generation flow remains unchanged.
- No unit consumption is triggered by quote actions.
- No payment, pickup orchestration, or booking confirmation is triggered.

## Phase 1.5 Checklist
- Quote engine reads versioned official rate cards from repo configuration.
- Component-wise totals are returned: base, registration, value payable, insurance, official total.
- Missing value payable/insurance schedules are reported clearly and never guessed.
- Existing protected SaaS unit/generation flows remain unchanged.

## Phase 2 Checklist
- Prisma models and migration exist for Aggregator Booking lifecycle entities.
- Quote can be converted into booking draft with sender/intake details.
- Customer can save draft, submit for review, and view timeline in separate dashboard.
- Admin can list queue, open booking detail, and perform approve/reject/correction/pending actions.
- Status transition guard enforces allowed actor-based transitions.
- Status events and audit logs are written for every mutation.
- Payment status is placeholder only (no live gateway).
- No label/MO generation execution paths are triggered.
- No Pakistan Post booking execution paths are triggered.
- No unit consumption is triggered by any Phase 2 action.

## Phase A (R2 Metadata Foundation) Checklist
- Prisma schema and migration include additive source metadata fields on `AggregatorQuote`.
- Prisma schema and migration include additive object/upload/local-cleanup metadata fields on `AggregatorBookingDocument`.
- Quote conversion payload accepts optional source metadata and stores it.
- Booking document metadata attach/list routes are available for authenticated booking owners.
- Metadata attach actions are audit logged.
- `jobs.ts` behavior remains unchanged.
- `cleanup.ts` deletion decision behavior remains unchanged.
- Worker generation flow remains unchanged.

## Phase 3C-1 (Bulk-Pack Planning Preview) Checklist
- Admin can save selected warehouse and intake carrier in aggregator admin workflow.
- Allowed warehouses restricted to `EPOST_LAHORE_WAREHOUSE` and `EPOST_SAHIWAL_WAREHOUSE`.
- Allowed intake carriers restricted to `CUSTOMER_SELF_DROP`, `PAKISTAN_POST_BULK_PACK`, and `LEOPARDS_BULK_PACK`.
- Bulk-pack label preview is available only for manual-approved/payment-ready bookings.
- Manifest preview is available only for manual-approved/payment-ready bookings.
- Preview responses include explicit manual-only warning wording.
- Preview actions are audit logged; no queue job is created.
- No external carrier API or Pakistan Post booking API is called.
- No pickup/dispatch/final booking action is created.
- No unit consumption is triggered.
- `jobs.ts`, `Upload.tsx`, and `worker.ts` behavior remains unchanged.

## Phase 3C-2 (Hub Receiving Verification) Checklist
- Admin can mark hub receiving with received count and condition note.
- Admin can verify manifest only when received count equals expected count.
- Admin can record mismatch only when received count differs from expected count.
- Admin mismatch payload requires mismatch reason and admin note.
- Admin can add exception note for mismatch trail.
- Admin can resolve mismatch with required resolution type and note.
- Customer booking detail/list render non-final warehouse receiving state wording.
- Responses expose derived `phase3c2Operational` metadata without schema changes.
- No external carrier/Pakistan Post booking API is called.

## Phase 3C-3 (Operational Handoff and Dispatch) Checklist
- Phase 3C-2 must be MANIFEST_VERIFIED or EXCEPTION_RESOLVED before any Phase 3C-3 action.
- Admin can record driver handoff (optional, fromParty/toParty/note required).
- Admin can record hub-to-sorting-facility dispatch (fromWarehouse/toSortingFacility/note required; hub receiving must exist).
- Admin can record inter-facility transfer (optional; sorting dispatch must exist first).
- Admin can mark ready for final postal processing (sorting dispatch must exist first; note min 10 chars).
- Customer booking detail shows Operational Movement Status card with non-final wording.
- Customer booking list shows Phase 3C-3 label when state != NOT_STARTED.
- Responses expose derived `phase3c3Operational` metadata without schema changes.
- All handoff payloads must include manualHandoffOnly/noFinalDispatch/noLiveCarrierApi/noPakistanPostBookingApi/noPickupExecution/noDispatchExecution/noFinalBookingConfirmation = true.
- No external carrier/Pakistan Post booking API is called.
- No pickup/dispatch/final booking action is created.
- `jobs.ts`, `Upload.tsx`, and `worker.ts` behavior remains unchanged.

## Phase 3C-5A (Manual Payment Verification) Checklist
- Customer can load payment options from `/api/aggregator-bookings/:id/payment/options`.
- Customer can submit manual payment proof to `/api/aggregator-bookings/:id/payment/manual-submit`.
- Customer can view derived payment lifecycle via `/api/aggregator-bookings/:id/payment/status`.
- Admin can verify manual payment via `/api/admin/aggregator-bookings/:id/payment/manual-verify`.
- Admin can reject manual payment via `/api/admin/aggregator-bookings/:id/payment/manual-reject`.
- Admin can cancel manual payment via `/api/admin/aggregator-bookings/:id/payment/manual-cancel`.
- All manual guardrail flags must be literal `true` and unknown payload fields are rejected.
- Booking detail/list and admin detail show: `Payment verification only. This is not final Pakistan Post booking confirmation.`
- Derived `phase3c5Payment` metadata is additive (audit-log derived) with no schema change.
- No live JazzCash/Easypaisa gateway execution.
- No SaaS invoice/subscription mutation.
- No pickup/dispatch/final booking execution.
- No Pakistan Post booking API execution.
- No pickup/dispatch/final booking action is created.
- `jobs.ts`, `Upload.tsx`, and `worker.ts` behavior remains unchanged.

## Phase 3C-5B (Isolated JazzCash Gateway Lane) Checklist
- Dedicated ledger model/table exists for aggregator gateway transactions (`AggregatorPaymentTransaction`).
- `idempotencyKey` and `callbackHash` are stored in `AggregatorPaymentTransaction` for callback idempotency and replay protection.
- Duplicate callbacks are blocked or acknowledged without reprocessing.
- Customer gateway options endpoint exists: `/api/aggregator-bookings/:id/payment/gateway-options`.
- Customer gateway start endpoint exists: `/api/aggregator-bookings/:id/payment/jazzcash/start`.
- Customer gateway status endpoint exists: `/api/aggregator-bookings/:id/payment/jazzcash/status`.
- Callback endpoints exist: `/api/aggregator-payments/jazzcash/callback` (GET/POST).
- Gateway relay/result endpoints exist: `/api/aggregator-payments/jazzcash/relay` and `/api/aggregator-payments/jazzcash/result`.
- Admin gateway operations exist: list transactions, reconcile, mark-failed, refund-note.
- Frontend includes isolated aggregator gateway result route: `/aggregator-bookings/payment/jazzcash/result`.
- Validation smoke script exists and prints `SMOKE_SCHEMA_ALL_DONE`: `apps/api/scripts/phase3c5b-gateway-smoke.mjs`.
- No SaaS package billing/subscription/invoice mutation.
- No SaaS unit/package credit mutation.
- No pickup/dispatch/final booking execution.
- No LabelJob creation and no queue job creation.
- No courier booking execution.
- No Pakistan Post booking API execution.
- `jobs.ts`, `Upload.tsx`, and `worker.ts` behavior remains unchanged.

## Regression Safeguards
- Verify existing upload route contract remains unchanged.
- Verify existing MO/tracking/complaint/billing behavior is unchanged.
- Verify no protected template/render paths changed.
- Verify `jobs.ts`, `Upload.tsx`, and `orders.ts` behavior remains unchanged.

## Operational Notes
- Treat quote as estimate only.
- Draft/submitted bookings are not final postal bookings.
- Do not apply courier as final value-payable carrier.

## Phase 3C-5B Staging Redirect Completion (2026-06-01)
- Staging resources verified before change (`Api-staging`, `Python-staging`, `Postgres`, `Redis`).
- Staging frontend service created/deployed:
	- Service: `Web-staging`
	- Public origin: `https://web-staging-staging-0299.up.railway.app`
- Frontend route verification on staging web:
	- `/` -> `200`
	- `/aggregator-bookings/payment/jazzcash/result?...` -> `200`
- `Api-staging` variables updated (staging only):
	- `FRONTEND_URL`
	- `WEB_ORIGIN`
- Redirect chain verification:
	- API `/api/aggregator-payments/jazzcash/result?...` -> `302`
	- `Location` host -> staging web origin (no API-domain redirect)
	- Follow URL -> `200`
- Regression recheck:
	- admin transaction list -> `200`
	- counters unchanged (`Payment=3`, `Invoice=3`, `Subscription=31`, `ManualPaymentRequest=0`, `LabelJob=4`)
- Safety confirmation:
	- no production touch,
	- no production DB touch,
	- no Cloudflare/R2 touch,
	- no pickup/dispatch/final-booking side effect.

## Phase 2B Scope Guardrails (2026-06-01)
- Draft request can be created only when quote has no error rows and no OVER_PHASE_LIMIT blocker.
- Sender name, phone, address, city and customer confirmation are mandatory.
- Customer status is queued as ADMIN_REVIEW_PENDING (display label: Pending Admin Review).
- Payment, pickup, dispatch, labels, and final-processing endpoints are blocked for this phase.

- Phase 2B lock update: remove/hide mark-pending, payment, gateway, handoff, final-processing, and bulk-pack controls from operational UI paths.

## Phase 2B Production Deployment Success (2026-06-01)
- Final status: PHASE_2B_PRODUCTION_DEPLOY_SUCCESS.
- Api and Web deployed in Railway production.
- Smoke checks passed: API health, root, login, booking quote, aggregator bookings, admin aggregator bookings.
- Unauthenticated protection confirmed: convert-to-draft 401 and admin approve 401.
