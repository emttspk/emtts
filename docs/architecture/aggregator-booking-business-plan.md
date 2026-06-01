# Aggregator Booking Business Plan

## Purpose
This document defines a separate Aggregator Booking business lane for ePost.pk that is independent from the existing unit-based SaaS label generation system.

## Core Separation Rule
- Existing SaaS lane remains unchanged and protected.
- Aggregator Booking lane is money-based and operationally staged.
- Controlled handoff to existing label/MO modules is allowed only in later approved phases.

## Phase 1 (Implemented Scope)
- Quote only.
- Pakistan Post per-article postage estimation only.
- Separate quote API and separate Booking Quote page.
- No payment, no pickup orchestration, no courier API, no booking confirmation automation.
- No service/handling/pickup/profit/discount charges.

## Phase 1.5 (Implemented Scope)
- Quote engine upgraded to versioned official postal rate cards.
- Componentized official charges supported:
	- Base postage
	- Registration fee
	- Value payable fee (structure enabled)
	- Insurance fee (structure enabled)
- Missing value payable and insurance schedules are reported and not guessed.
- Aggregator quote lane remains separate from existing unit SaaS lane.

## Phase 2 (Implemented Scope)
- Customer can convert quote into booking draft.
- Booking stores sender details, intake method, hub city, and special instructions.
- Intake methods:
	- Drop at Lahore collection point
	- Drop at Sahiwal collection point
	- Pickup requested from customer address (future Leopards workflow)
- Booking is stored as money-based order records, separate from unit-based jobs.
- Customer has separate Aggregator Booking dashboard for list/detail/timeline.
- Admin has separate Aggregator Booking queue for approve/reject/request correction/mark pending.
- Status transition guard and actor policy are enforced.
- Status events and audit logs are written on every mutation.
- Payment is placeholder status only.

## Phase 2 Explicit Exclusions
- No live payment gateway integration.
- No courier pickup email automation.
- No label generation execution.
- No money order generation execution.
- No Pakistan Post final booking execution.
- No SaaS unit deduction.

## Phase A (R2 Metadata Foundation - Implemented)
- Additive-only metadata support for source files on `AggregatorQuote`.
- Additive-only metadata support for object/upload/local-cleanup lifecycle on `AggregatorBookingDocument`.
- Customer APIs can attach/list booking document metadata records.
- Source file metadata can be persisted during quote-to-draft conversion.
- No changes to generation execution path, cleanup cron deletion behavior, worker flow, or read preference order.

## Future Phases
- Phase 3: pickup email and secure pickup status updates.
- Phase 4: article-wise Pakistan Post booking workflow and controlled handoff to label/MO generation.
- Phase 5: payment, invoicing, refund/adjustment, and advanced exception handling.

## Phase 3C-1 (Implemented Scope)
- Manual planning panel for admin after manual-approved/payment-ready booking state.
- Admin can select warehouse:
	- `EPOST_LAHORE_WAREHOUSE`
	- `EPOST_SAHIWAL_WAREHOUSE`
- Admin can select intake carrier:
	- `CUSTOMER_SELF_DROP`
	- `PAKISTAN_POST_BULK_PACK`
	- `LEOPARDS_BULK_PACK`
- Admin can generate preview-only bulk-pack label payload.
- Admin can generate preview-only manifest payload.
- Planning selections and preview outputs are audit logged.

## Phase 3C-1 Explicit Exclusions
- No live Leopards API call.
- No live Pakistan Post booking API call.
- No pickup execution.
- No dispatch execution.
- No final booking confirmation.

## Phase 3C-5A (Implemented Scope)
- Customer can view manual payment options for aggregator booking lifecycle.
- Customer can submit manual payment proof for admin verification.
- Admin can verify, reject, or cancel manual payment submissions.
- Payment state is additive and audit-log derived (`phase3c5Payment`).
- Required customer/admin wording:
	- `Payment verification only. This is not final Pakistan Post booking confirmation.`

## Phase 3C-5A Explicit Exclusions
- No live JazzCash gateway execution.
- No live Easypaisa gateway execution.
- No SaaS subscription, billing, or invoice mutation.
- No pickup or dispatch execution.
- No Pakistan Post booking API execution.
- No final booking confirmation.
- No schema/migration change.
- No payment gateway implementation.
- No service/handling/profit/discount logic.
- No schema/migration change.

## Phase 3C-5B (Implemented Scope)
- Isolated JazzCash gateway lane for aggregator bookings with callback-based lifecycle updates.
- Dedicated ledger model/table for gateway transactions (`AggregatorPaymentTransaction`).
- Callback idempotency and replay protection are enforced using `idempotencyKey` and `callbackHash` stored per transaction.
- Duplicate callbacks must be blocked or acknowledged without reprocessing.
- Customer can start gateway payment and check gateway transaction status from aggregator booking detail.
- Callback relay/result flow is isolated under `/api/aggregator-payments/*`.
- Admin can list gateway transactions and perform manual reconciliation/failure/refund-note updates.
- Customer sees separate aggregator gateway result page (`/aggregator-bookings/payment/jazzcash/result`).
- Gateway success marks aggregator payment received only and is not final booking confirmation.

## Phase 3C-5B Explicit Exclusions
- No SaaS package billing/subscription/invoice mutation.
- No SaaS unit/package credit mutation.
- No pickup/dispatch/final booking execution.
- No LabelJob creation and no queue job creation.
- No courier booking execution.
- No Pakistan Post booking API execution.
- No protected scope mutation outside aggregator booking lane.

## Phase 3C-2 (Implemented Scope)
- Admin can mark bulk pack received at selected ePost warehouse.
- Admin can verify manifest expected vs received article count.
- Admin can record mismatch with reason and note.
- Admin can add manual exception note trail.
- Admin can resolve mismatch manually with resolution type and note.
- Customer can view non-final warehouse receiving/exception status.
- Phase 3C-2 state is derived from additive audit-log JSON metadata.

## Phase 3C-2 Explicit Exclusions
- No final dispatch confirmation.
- No Pakistan Post booking API call.
- No live courier booking API call.
- No pickup execution.
- No dispatch execution.
- No payment collection.

## Phase 3C-3 (Implemented Scope)
- Admin can record driver-to-hub handoff (optional, any time after Phase 3C-2 gate).
- Admin can record hub-to-sorting-facility dispatch (required prerequisite for transfer and ready-for-postal).
- Admin can record inter-facility transfer (optional, requires sorting dispatch first).
- Admin can mark ready-for-final-postal-processing (requires sorting dispatch first).
- Customer can view non-final operational movement status with notice wording.
- Phase 3C-3 state is derived from additive audit-log JSON metadata using actions: DRIVER_HANDOFF_RECORDED, HUB_SORTING_DISPATCH_RECORDED, INTER_FACILITY_TRANSFER_RECORDED, READY_FOR_FINAL_POSTAL_PROCESSING.
- Entry gate: Phase 3C-2 currentState must be MANIFEST_VERIFIED or EXCEPTION_RESOLVED.
- Customer notice: "This is operational movement status only. Final Pakistan Post article processing is a separate future step."
- Admin banner: "Handoff recording is manual operational logging only. It is not final dispatch or Pakistan Post booking confirmation."

## Phase 3C-3 Explicit Exclusions
- No final dispatch confirmation.
- No live Pakistan Post booking API call.
- No live Leopards courier API call.
- No pickup execution.
- No dispatch execution.
- No payment collection.
- No schema/migration change.
- No service/handling/profit/discount logic.
- No schema/migration change.

## Protected Systems (Not Changed)
- Existing upload/generation path.
- Existing money order and MOS/UMO logic.
- Existing tracking, complaints, billing/unit consumption.
- Existing auth, worker, storage, admin, and templates.

## Delivery Carrier Rule
Leopards is for bundle movement to ePost hub only. Final value-payable delivery products remain Pakistan Post products.

## Phase 3C-5B Staging Redirect Validation (2026-06-01)
- Staging API and Web split is now explicitly validated for aggregator gateway result redirection.
- Staging Web service `Web-staging` was deployed and verified at:
	- `https://web-staging-staging-0299.up.railway.app`
- `Api-staging` redirect-origin variables were corrected in staging only:
	- `FRONTEND_URL`
	- `WEB_ORIGIN`
- Result endpoint behavior after correction:
	- API `/api/aggregator-payments/jazzcash/result` -> `302` with `Location` on staging web origin.
	- Followed frontend route `/aggregator-bookings/payment/jazzcash/result` -> `200`.
- Gateway safeguards remained intact:
	- duplicate callback block,
	- invalid-hash reconciliation,
	- amount-mismatch reconciliation,
	- admin reconcile/mark-failed/refund-note controls.
- No SaaS billing/subscription/invoice/unit mutation occurred.
- No pickup/dispatch/final-booking execution occurred.
- No production or Cloudflare/R2 touch occurred.

## Phase 2B Draft Request Architecture Update (2026-06-01)
- Quote preview conversion persists a draft request and immediately enters admin review pending state.
- Existing AggregatorQuote/AggregatorBooking/AggregatorBookingItem/StatusEvent/AuditLog models are reused.
- No payment transaction, payment placeholder transition, pickup, dispatch, label generation, or SaaS unit consumption is part of Phase 2B execution path.

- Phase 2B UI/API scope lock ensures admin decision surface is limited to approve/reject/correction and customer view excludes non-2B flows.

## Phase 2B Production Validation (2026-06-01)
- Deployed commit line through main at 67b13c2 with successful production verification.
- Phase 2B behavior in production confirms draft-request + admin-review scope with protected unauthenticated API boundaries (401).
