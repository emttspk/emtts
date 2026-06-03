# Barcode Scanner Mobile UX Audit (2026-06-03)

## Scope
- Homepage Track Parcel UI only
- Homepage barcode scanner UI and mobile layout only
- Camera permission messaging only
- No auth, money order, complaints, billing, backend, or postal workflow logic changes

## Problem Statement
When users tapped Scan Barcode on homepage mobile:
- Camera permission context was not explained before browser prompt
- Scanner panel appeared below action buttons instead of above
- Permission denied guidance was generic and not actionable
- Retry path after blocked permission was missing

## Implemented Fixes

### 1) Scanner panel moved above action buttons
Updated homepage track form layout so scanner panel appears between:
- tracking input
- Track + Scan Barcode action buttons

This keeps the tracking input visible while ensuring scanner appears in the expected place on mobile.

### 2) Pre-permission notice added
Before scanner startup, UX now shows:

"Camera permission is required to scan barcode. Please tap Allow when your browser asks."

This is informational only. No attempt is made to force camera permission in code.

### 3) Permission blocked instruction improved
On blocked/denied camera access, UX now shows:

"Camera access was blocked. Tap the lock/site settings icon in your browser and allow Camera, then try again."

### 4) Retry button added
When blocked/unavailable errors occur, scanner panel now includes:
- Retry Scanner button

Retry triggers a clean scanner restart attempt from the same panel.

### 5) Mobile-first scanner panel polish
Scanner panel updated with:
- premium card surface and shadow
- clear close control with icon + text
- contained preview area with no overflow jump
- retained input visibility during scan flow

## Behavioral Guarantees
- Camera is never auto-opened on page load.
- Scanner opens only after user taps Scan Barcode.
- No code path claims camera permission can be silently enabled by website code.

## Files Changed
- `apps/web/src/components/HomeHero.jsx`
- `docs/operations/barcode-scanner-mobile-ux-audit-2026-06-03.md`
- `docs/operations/frontend-ui-first-load-audit-2026-06-03.md`
- `AI_IMPLEMENTATION_INDEX.md`

## Validation Plan
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Browser check on `/` mobile viewport

## Expected Outcome
- Scanner panel opens above action buttons: yes
- Permission UX clarity improved: yes
- Retry path present: yes
- Mobile homepage tracking section remains stable: yes
