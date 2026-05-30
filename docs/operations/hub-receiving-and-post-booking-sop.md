# Hub Receiving and Post Booking SOP (Future Phase 4)

## Status
Planned for future phase. Not active in Phase 2.

## Phase 2 Boundary
- Phase 2 only supports draft/review/timeline and payment placeholder status.
- Phase 2 does not perform hub receiving, post booking, label generation, or money order generation.
- Phase 3 may add pickup email and secure pickup tracking update link only.

## Phase A Metadata Boundary
- Phase A adds only storage metadata readiness fields and APIs for aggregator quote/document records.
- Phase A does not activate hub receiving, Pakistan Post booking execution, label generation handoff, or MO generation handoff.

## Hub Receiving Steps
1. Mark bundle received at Lahore/Sahiwal hub.
2. Verify article count and bundle weight.
3. Record mismatches as verification exceptions.
4. Move valid bookings to READY_FOR_POST_BOOKING.

## Post Booking Steps
1. Book each article through Pakistan Post workflow.
2. Store Pakistan Post tracking per article.
3. Trigger controlled label generation handoff.
4. Trigger controlled MO form handoff for relevant products.

## Controls
- Role-based action gates (operator/admin)
- Immutable status event logs
- Exception queue for mismatches and rework
