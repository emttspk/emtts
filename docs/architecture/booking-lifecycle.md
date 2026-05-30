# Aggregator Booking Lifecycle

## Phase 2 Active Lifecycle States
- QUOTE_READY
- BOOKING_DRAFT
- BOOKING_SUBMITTED
- ADMIN_REVIEW_PENDING
- CORRECTION_REQUIRED
- ADMIN_APPROVED
- ADMIN_REJECTED
- PAYMENT_PENDING_PLACEHOLDER
- DROP_PENDING
- PICKUP_PENDING_FUTURE
- CANCELLED

## Phase 2 Transition Rules
- QUOTE_READY -> BOOKING_DRAFT
- BOOKING_DRAFT -> BOOKING_SUBMITTED
- BOOKING_SUBMITTED -> ADMIN_REVIEW_PENDING
- ADMIN_REVIEW_PENDING -> ADMIN_APPROVED
- ADMIN_REVIEW_PENDING -> ADMIN_REJECTED
- ADMIN_REVIEW_PENDING -> CORRECTION_REQUIRED
- CORRECTION_REQUIRED -> BOOKING_SUBMITTED
- ADMIN_APPROVED -> PAYMENT_PENDING_PLACEHOLDER
- PAYMENT_PENDING_PLACEHOLDER -> DROP_PENDING
- PAYMENT_PENDING_PLACEHOLDER -> PICKUP_PENDING_FUTURE
- Non-terminal states may move to CANCELLED only through actor policy.

## Phase Boundaries
- Phase 2 is draft/review/timeline only.
- Phase 2 does not execute live payment, courier email, label generation, MO generation, or Pakistan Post booking.

## Controlled Handoff
- Phase 3 boundary: pickup email and secure pickup tracking update link.
- Phase 4 boundary: hub receiving, article-wise booking, and controlled handoff to existing protected label/MO generation modules.
