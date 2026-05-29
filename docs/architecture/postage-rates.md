# Pakistan Post Postage Rates (Phase 1 Quote Engine)

## Scope
Phase 1 quote-only tariff engine for Pakistan Post aggregator booking estimates.

## Calculation Principles
- Postage is per individual article.
- Total postage is sum of per-article results.
- Bundle weight is not used for postage slabs.
- Missing/invalid weight returns row errors.
- Unsupported category/slab returns row errors.

## Categories
- LETTER
- PRINTED_PAPER
- TEXT_BOOK
- PARCEL
- UMS

## Important Text Book Gap
There is no supplied slab for text books exceeding 50g and not exceeding 250g.
The engine must not invent this slab and returns unsupported slab error for this interval.

## UMS Local vs City-to-City
- Local applies only when sender and receiver city normalize to the same token.
- If local cannot be confirmed, City-to-City tariff is used with warning.

## Service Mapping Defaults
- RGL, VPL, IRL -> LETTER (unless category supplied)
- PAR, VPP -> PARCEL (unless category supplied)
- UMS -> UMS
- COD -> UMS estimate with warning for later operational confirmation

## Exclusions
- No service charges
- No handling charges
- No pickup charges
- No profit margin
- No discounts
