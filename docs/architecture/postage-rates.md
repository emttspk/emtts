# Pakistan Post Postage Rates (Phase 1)

## Scope
Phase 1 implements a quote-only calculator for Pakistan Post postage estimates at per-article level.

## Inputs
- `serviceCode` (`UMS`, `COD`, `RGL`, `VPL`, `VPP`, `IRL`, `PAR`)
- `weightGrams`
- `senderCity` and `receiverCity` (for UMS local vs city-to-city)
- `articleCategory` (optional override)
- `isTextbook` (optional)

## Output Model
- Per-row: `postageAmount`, matched slab, warnings, errors
- Summary: `totalPostageAmount`, grouped totals by category/product, per-row diagnostics
- Response is quote-only and does not create booking drafts or payment states

## Core Rules
- Calculate each article independently; no bundled weight logic
- Validate missing/negative/invalid weight as row errors
- Keep text-book slab gap strict: above 50g and not exceeding 250g is unsupported
- For UMS/COD, city normalization decides local vs city-to-city
- If local cannot be confirmed for UMS/COD, use city-to-city and add warning
- Add informational warning for VPL/VPP/COD final-delivery product status

## Category Mapping Defaults
- `RGL`, `VPL`, `IRL` -> `Letters`
- `PAR`, `VPP` -> `Parcels`
- `UMS`, `COD` -> `UMS Local` or `UMS City to City` from normalized cities
- `isTextbook=true` -> `Printed Papers Text Books`

## Exclusions
- No booking conversion
- No payment initiation
- No service charges or pickup charges
- No label or money-order generation side effects

## Cross-Reference
For continuity boundaries, protected scope, and break-resume protocol, see `docs/architecture/booking-business-plan.md`.
