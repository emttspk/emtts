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

## Regression Safeguards
- Verify existing upload route contract remains unchanged.
- Verify existing MO/tracking/complaint/billing behavior is unchanged.
- Verify no protected template/render paths changed.
- Verify `jobs.ts`, `Upload.tsx`, and `orders.ts` behavior remains unchanged.

## Operational Notes
- Treat quote as estimate only.
- Draft/submitted bookings are not final postal bookings.
- Do not apply courier as final value-payable carrier.
