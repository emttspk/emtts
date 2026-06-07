# Meta Transport Fix Audit 2026

Date: 2026-06-07

## Root Cause

The Meta Pixel bootstrap in `apps/web/src/lib/analytics.ts` used a custom initialization path that did not behave like the official Meta snippet closely enough for transport validation. In local browser probes, `fbevents.js` and `signals/config` loaded and `fbq` executed, but `facebook.com/tr` beacons were still not observable.

## Fix Applied

- Replaced the custom Meta bootstrap shape with a closer official-style snippet.
- Script insertion now uses the first script tag insertion pattern used by Meta.
- `fbq` is initialized with the standard `loaded`, `version`, `push`, and `queue` setup.

## Verified So Far

- `fbevents.js` loads successfully.
- `signals/config` loads successfully.
- `fbq` exists and is callable.
- Standard events execute without runtime errors.
- Local headless browser probes still did not surface `facebook.com/tr` requests.

## Remaining Verification

- Confirm the updated bootstrap on the live production domain in a non-headless Chrome session.
- Recheck the Meta Pixel Helper and Network tab for `facebook.com/tr` delivery.

## Notes

This audit records the transport fix implementation and the current verification boundary. It does not claim production-side beacon delivery until the live browser check is completed.
