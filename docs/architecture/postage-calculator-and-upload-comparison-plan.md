# Postage Calculator and Upload Comparison Plan (Phase 1)

- Additive quote-only API at `/api/postage-calculator/calculate`.
- Per-article Pakistan Post calculation uses existing `postageRates` utility.
- Upload summary parsing is comparison-only and non-booking.
- Comparison is bundle-level for courier vs per-article Pakistan Post.
- No payment, booking execution, migration, or storage side effects.
