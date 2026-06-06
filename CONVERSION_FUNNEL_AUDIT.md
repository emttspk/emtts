# Conversion Funnel Audit

Date: 2026-06-06

## Scope

Audit-only review of the customer path:

Anonymous User -> Register -> Login -> Upload CSV -> Generate Labels -> Download Labels -> View Billing -> Select Package -> Payment Start -> Payment Success

## Summary

- The core product journey is present and usable.
- Authentication is now functioning on both desktop and mobile.
- The funnel still has analytics gaps in the revenue path.
- No obvious dead-end screens were found in the live public sweep.

## Journey Review

### Anonymous User

- Public landing page is clear and mobile-safe.
- Primary CTAs are visible: `Start Free`, `Track Parcel`, and `WhatsApp Demo`.
- The anonymous path naturally pushes users toward registration or login.

### Register

- Register page is available and functional.
- Registration success is visible through `registration_complete` tracking in code.
- Mobile Google auth now falls back to redirect, which addresses the reported mobile Firebase failure.

### Login

- Login page is available and functional.
- Email/password login and Google login are both present.
- Desktop uses popup Google auth; mobile uses redirect Google auth.

### Upload CSV

- Upload flow is present and strongly guided.
- The page shows validation, progress, completion, and download states.
- Auto-download after completion is a good conversion helper.

### Generate Labels

- Label generation flow is present.
- Completed state and download readiness are visible.
- The flow is rich, but it is also dense on mobile.

### Download Labels

- Download action exists and is automatic after completion for the active job.
- The jobs page also exposes ready downloads.

### View Billing

- Billing page is present with status, plan, and success/error messaging.
- Payment success is visible when `payment=success` is returned in the URL.

### Select Package

- Select package is present as part of the billing flow.
- Anonymous users are redirected to login rather than landing on a dead-end screen.

### Payment Start

- Payment start exists in the product flow.
- The billing screen can trigger redirect/manual payment flows.
- This is the highest-risk step because it is where revenue starts.

### Payment Success

- Payment success is represented by status/query-param handling and success banners.
- No separate dedicated success page is required for the current flow.

## Funnel Findings

- Broken step: GA4 event coverage is missing for upload, label generation, package selection, and payment start.
- Confusing step: billing and select-package are the same underlying component, so the user-facing distinction is subtle.
- Excessive clicks: the conversion path is longer than ideal, especially before payment start.
- Loading delays: upload and generation are intentionally stateful and can feel slow on mobile.
- Mobile issues: no layout overflow or rendering failure was observed in the public/mobile sweep.

## Analytics Coverage

- Register event: present and wired.
- Upload event: helper exists, but no screen wiring was found.
- Label generation event: helper exists, but no screen wiring was found.
- Package selection event: helper exists conceptually via billing flow, but no screen wiring was found.
- Payment start event: helper exists, but no screen wiring was found.
- Payment success event: helper exists, but no screen wiring was found.

## Dead-End Check

- No obvious dead-end screens were found in the public sweep.
- Auth-gated routes correctly redirect to login instead of showing broken content.
- Success and error states are visible on register, upload, and billing screens.

## Top 5 Improvements

1. Wire GA4 events into upload, label generation, package selection, payment start, and payment success.
2. Make the billing/package handoff more explicit so users understand where they are in the checkout path.
3. Reduce mobile friction on the upload and billing screens by tightening the amount of copy shown above the fold.
4. Add a clearer funnel success state after payment success instead of relying only on query-parameter messaging.
5. Add a lightweight conversion-progress indicator so users can see how close they are to completion.

## Readiness

- Funnel completion: 80%
- Highest revenue risk: missing analytics around package selection and payment start.
- Overall readiness: 80%

## Implementation Update

- Conversion funnel analytics wiring is now in place for file upload, label generation start/success, package selection, payment start, and payment success.
- Remaining verification work is browser-side only: confirm GA4 DebugView and Network transport requests in Chrome for the live production bundle.
