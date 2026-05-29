# Aggregator Booking Lifecycle

## Lifecycle States
- QUOTE_CREATED
- QUOTE_CONFIRMED
- PAYMENT_PENDING
- PAYMENT_RECEIVED
- DROP_PENDING
- PICKUP_REQUESTED
- PICKUP_EMAIL_SENT
- PICKUP_TRACKING_PENDING
- PICKUP_IN_TRANSIT
- RECEIVED_AT_HUB
- UNDER_VERIFICATION
- VERIFICATION_EXCEPTION
- READY_FOR_POST_BOOKING
- POST_BOOKED
- LABELS_GENERATED
- MO_FORMS_GENERATED
- DISPATCHED
- DELIVERED
- CANCELLED
- REFUND_PENDING
- CLOSED

## Phase 1 Active States
- QUOTE_CREATED

Phase 1 does not execute booking, payment, pickup, post-booking, or dispatch states.

## Controlled Handoff
LABELS_GENERATED and MO_FORMS_GENERATED are controlled boundaries and can only use existing protected generation modules in later approved phases.
