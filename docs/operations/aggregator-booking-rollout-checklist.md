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

## Regression Safeguards
- Verify existing upload route contract remains unchanged.
- Verify existing MO/tracking/complaint/billing behavior is unchanged.
- Verify no protected template/render paths changed.

## Operational Notes
- Treat quote as estimate only.
- Do not treat quote as confirmed booking.
- Do not apply courier as final value-payable carrier.
