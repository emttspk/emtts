# Phase-2 Generation Rules (Authoritative)

## Canonical Services
Valid shipment services are strictly:
- VPL
- VPP
- COD
- RGL
- IRL
- UMS

VPX is removed from generation paths.

## Namespace Rules
- shipment_type must resolve to canonical namespace.
- Tracking prefix must match shipment_type exactly.
- Tracking format remains: PREFIX + MM + SERIAL (public format preserved).
- Tracking IDs must be 11-12 characters (4-digit serial with automatic 5-digit overflow).
- No tracking truncation is allowed.

## Mixed Mode Rules
Processing modes:
- single_service: selected shipment_type is authoritative.
- mix_articles: row shipment_type is authoritative.

single_service:
- Row shipment_type mismatches are rejected.
- Manual tracking must match selected shipment_type prefix.
- Auto mode ignores uploaded tracking when prefix mismatches selected shipment_type and generates fresh tracking.

mix_articles:
- Each row must include canonical shipment_type.
- Existing tracking on a row must match that row shipment_type prefix.
- Prefix mismatches are row-level errors.
- Auto generation still allocates tracking per row shipment_type.

## Money Order Rules
Only these services are MO eligible:
- VPL
- VPP
- COD

MO namespace:
- VPL/VPP -> MOS
- COD -> UMO

RGL/IRL/UMS must never generate money orders.

## Validation Rules
Upload validation includes:
- Required column and required consignee field validation.
- Canonical shipment_type validation.
- Namespace prefix validation for tracking IDs.
- Duplicate tracking detection.
- Manual mode: strict prefix enforcement.
- Mix mode: row-authoritative prefix enforcement.
- Accepted/rejected summary and row-level warnings/errors in UI.
- Ignored-tracking warnings in single_service + auto mode.

## Weight Rules
Weight framework is enforced as warnings only:
- Service-specific weight limits are checked during upload validation.
- Over-limit rows produce warnings and best-fit service suggestions.
- No automatic shipment splitting.
- Split-shipment behavior remains a future hook only.

## Compatibility Rules
- Public tracking format remains unchanged.
- Rendering geometry and allocator internals are unchanged.
- Queue architecture is unchanged.
- Urdu typography and money-order print layout are unchanged.
