# Pakistan Post Official Postal Charges (Phase 1.5 Rate Card Engine)

## Scope
Phase 1.5 quote-only official charge engine for Pakistan Post aggregator booking estimates.

## Rate Card Model
- Versioned and editable in repository for Phase 1.5.
- Separate component cards:
	- BASE_POSTAGE
	- REGISTRATION_FEE
	- VALUE_PAYABLE_FEE
	- INSURANCE_FEE
- Future admin-editable DB cards require separate approval.

## Calculation Principles
- Base/postal fee components are calculated per individual article.
- Total official postal charge is sum of available component values.
- Bundle weight is not used for postage slabs.
- Missing/invalid weight returns row errors.
- Unsupported category/slab returns row errors.
- Missing value payable or insurance schedules are never guessed.

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
