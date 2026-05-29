# Hub Receiving and Post Booking SOP (Future Phase)

## Status
Planned for future phase. Not active in Phase 1.

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
