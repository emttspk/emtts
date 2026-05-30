# Booking Business Plan (Phase 1)

## Objective
Deliver a safe, quote-only booking estimate capability without changing the existing upload, generation, billing, or post-booking operational flow.

## Phase 1 Deliverables
- API endpoint for quote calculation from uploaded CSV/XLSX or JSON rows.
- Per-article Pakistan Post postage calculation by supported service code.
- Quote summary totals and row-level diagnostics (warnings/errors).
- Web page for quote upload/manual rows with transparent output table.

## Explicit Non-Goals
- No booking draft creation.
- No payment or gateway workflow.
- No label generation or money-order generation.
- No modifications to existing SaaS unit-based upload flow.

## Revenue/Operations Positioning
- Supports pre-booking pricing visibility for aggregator users.
- Reduces failed or uncertain booking attempts before operational intake.
- Keeps financial and operational commitments unchanged until later phases.

## Quality Gates
- Build, test, lint, and typecheck must pass before rollout.
- Rate logic must keep explicit unsupported-slab behavior where tariff gaps exist.
- Protected scope modules remain unchanged.

## Future Phase Hooks
- Controlled quote-to-draft conversion may be added in later phase under explicit approval.
- Any payment or fulfillment integration remains out of scope for this phase.
