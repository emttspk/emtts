# Aggregator Booking Rollout Checklist

## Phase 1 Checklist
- Separate booking quote API route is isolated from existing upload route.
- Separate Booking Quote page is available for authenticated users.
- Postage quote engine validates missing/invalid/unsupported rows.
- Quote output includes summary, by-category/product buckets, and per-row diagnostics.
- Existing upload/generation flow remains unchanged.
- No unit consumption is triggered by quote actions.
- No payment, pickup orchestration, or booking confirmation is triggered.

## Regression Safeguards
- Verify existing upload route contract remains unchanged.
- Verify existing MO/tracking/complaint/billing behavior is unchanged.
- Verify no protected template/render paths changed.

## Operational Notes
- Treat quote as estimate only.
- Do not treat quote as confirmed booking.
- Do not apply courier as final value-payable carrier.
