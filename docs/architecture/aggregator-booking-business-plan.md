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
- No payment gateway implementation.
- No service/handling/profit/discount logic.
- No schema/migration change.

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
- No service/handling/profit/discount logic.
- No schema/migration change.

## Protected Systems (Not Changed)
- Existing upload/generation path.
- Existing money order and MOS/UMO logic.
- Existing tracking, complaints, billing/unit consumption.
- Existing auth, worker, storage, admin, and templates.

## Delivery Carrier Rule
Leopards is for bundle movement to ePost hub only. Final value-payable delivery products remain Pakistan Post products.
