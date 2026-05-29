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

## Future Phases
- Phase 2: booking draft and admin review.
- Phase 3: pickup email and secure pickup status updates.
- Phase 4: hub verification and article-wise Pakistan Post booking workflow.
- Phase 5: payment, invoicing, refund/adjustment, and advanced exception handling.

## Protected Systems (Not Changed)
- Existing upload/generation path.
- Existing money order and MOS/UMO logic.
- Existing tracking, complaints, billing/unit consumption.
- Existing auth, worker, storage, admin, and templates.

## Delivery Carrier Rule
Leopards is for bundle movement to ePost hub only. Final value-payable delivery products remain Pakistan Post products.
