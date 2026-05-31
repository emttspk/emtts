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

## Regression Safeguards
- Verify existing upload route contract remains unchanged.
- Verify existing MO/tracking/complaint/billing behavior is unchanged.
- Verify no protected template/render paths changed.
- Verify `jobs.ts`, `Upload.tsx`, and `orders.ts` behavior remains unchanged.

## Operational Notes
- Treat quote as estimate only.
- Draft/submitted bookings are not final postal bookings.
- Do not apply courier as final value-payable carrier.
