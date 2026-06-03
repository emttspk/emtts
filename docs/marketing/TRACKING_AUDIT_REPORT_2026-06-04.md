# Marketing Tracking Audit Report - 2026-06-04

## Implementation Update (2026-06-04)

- Minimal analytics foundation implemented:
	- Added central analytics helper at `apps/web/src/lib/analytics.ts`.
	- Added environment-based initialization for `VITE_GA_MEASUREMENT_ID` and `VITE_META_PIXEL_ID` (no hardcoded IDs).
	- Wired safe events only in this pass: `page_view`, `lead_start`, `tracking_search`, `whatsapp_demo_click`.
	- Event payload policy enforced to safe generic keys only (`source`, `count`, `path`, etc.) with no PII.

## Phase 2 SEO Note (2026-06-04)

- Analytics remained unchanged in Phase 2.
- This phase only hardened SEO social metadata and structured data in `apps/web/index.html`.

## Phase 3 Event Status (2026-06-04)

- `registration_complete` is now tracked after successful registration API responses in `apps/web/src/pages/Register.tsx`.
- Dedicated marketing WhatsApp demo CTA link is still not present in Navbar/Footer/Home; no new marketing WhatsApp event hook added in this phase.
- Existing safe WhatsApp sharing tracking remains in public tracking flow (`whatsapp_demo_click`) without PII.

## Phase 3.1 Event Status (2026-06-04)

- WhatsApp demo CTA event implemented.
- Public Home CTA now tracks `whatsapp_demo_click` with source `home_demo` only.
- CTA uses `VITE_PUBLIC_WHATSAPP_NUMBER` when configured; otherwise renders disabled "coming soon" state.

## Frontend Environment Guide (WhatsApp Demo CTA)

- Variable: `VITE_PUBLIC_WHATSAPP_NUMBER`
- Example format only: `VITE_PUBLIC_WHATSAPP_NUMBER=923001234567`
- Use digits only.
- Do not use plus sign (`+`).
- Do not use spaces.
- Do not use hyphens.
- Do not use a private/personal number unless explicitly approved as public business WhatsApp.

## Production Verification Checklist (WhatsApp Demo Tracking)

- [ ] Set `VITE_PUBLIC_WHATSAPP_NUMBER` in Railway web/frontend service variables.
- [ ] Redeploy the web/frontend service.
- [ ] Open the ePost.pk home page.
- [ ] Confirm WhatsApp Demo CTA is enabled.
- [ ] Click CTA and confirm `wa.me` opens.
- [ ] Confirm GA4 Realtime receives WhatsApp click event when GA measurement ID is configured.
- [ ] Confirm Meta Pixel Helper detects WhatsApp click event when Meta Pixel ID is configured.
- [ ] Confirm event payload contains no phone, CNIC, address, tracking ID, parcel data, or payment reference.

## Production Verification Runbook (GA4 + Meta Pixel)

### GA4 DebugView / Realtime

- [ ] Confirm `VITE_GA_MEASUREMENT_ID` is set in Railway frontend/web service variables.
- [ ] Redeploy the web/frontend service.
- [ ] Open production homepage (`https://www.epost.pk/`).
- [ ] Open GA4 Realtime or DebugView.
- [ ] Confirm `page_view` is received.
- [ ] Click `Start Free` on homepage.
- [ ] Click WhatsApp Demo CTA.
- [ ] Run a tracking search with test count only.
- [ ] Confirm no CNIC, phone, address, tracking ID, parcel data, payment reference, or file content is present in event payloads.

### Meta Pixel Helper

- [ ] Confirm `VITE_META_PIXEL_ID` is set in Railway frontend/web service variables.
- [ ] Redeploy the web/frontend service.
- [ ] Open production homepage (`https://www.epost.pk/`) with Meta Pixel Helper enabled.
- [ ] Confirm `PageView` is detected.
- [ ] Confirm safe custom events are detected (if Meta Pixel is configured).
- [ ] Confirm no sensitive payload is emitted.

## Evidence Capture Checklist

- [ ] Screenshot GA4 `page_view` confirmation (Realtime or DebugView).
- [ ] Screenshot Meta Pixel Helper `PageView` confirmation.
- [ ] Store screenshots outside this repository unless a dedicated docs artifact folder is approved.

## Production Verification Attempt (2026-06-03 23:00 UTC)

- No PII used during this verification attempt.
- Login-protected pages were not tested.

### URL and Route Checks

| Check | Result | Notes |
|------|------|------|
| `https://www.epost.pk/` | PASS | HTTP 200 returned. |
| `https://www.epost.pk/robots.txt` | PASS | HTTP 200 returned. |
| `https://www.epost.pk/sitemap.xml` | PASS | HTTP 200 returned. |
| `https://www.epost.pk/tracking` | PASS | HTTP 200 and app root shell present. |
| `https://www.epost.pk/pricing` | PASS | HTTP 200 and app root shell present. |
| `https://www.epost.pk/register` | PASS | HTTP 200 and app root shell present. |
| `https://www.epost.pk/support` | PASS | HTTP 200 and app root shell present. |

### Analytics and Payload Safety Checks

| Check | Result | Notes |
|------|------|------|
| Homepage static SEO/meta/JSON-LD markers present in HTML | PASS | Title, description, canonical, OG/Twitter tags, and JSON-LD detected in production HTML. |
| GA4 DebugView/Realtime event confirmation | NEEDS MANUAL CONFIRMATION | Requires Railway env confirmation for `VITE_GA_MEASUREMENT_ID` and browser GA4 access. |
| Meta Pixel Helper event confirmation | NEEDS MANUAL CONFIRMATION | Requires Railway env confirmation for `VITE_META_PIXEL_ID` and Pixel Helper extension. |
| Sensitive payload absence confirmation in analytics tools | NEEDS MANUAL CONFIRMATION | Must be confirmed in GA4/Pixel dashboards after live event inspection. |

## robots.txt Fix Note (2026-06-04)

- robots.txt sitemap directive fix prepared; production requires redeploy/recheck.

## Production analytics/SEO Recheck Status (2026-06-03 23:17 UTC)

- Web service redeploy was triggered in Railway production (`Web` service).
- Production recheck now confirms `robots.txt` includes `Sitemap: https://www.epost.pk/sitemap.xml`.
- Production recheck confirms `sitemap.xml` is reachable and includes required public URLs.
- Homepage remains reachable with expected canonical and JSON-LD markers.
- GA4/Meta validation remains manual and depends on Railway env values plus dashboard/extension access.

## Current Status
**CRITICAL MISSING** - The ePost.pk platform currently has **zero** marketing tracking implemented. There is no Meta Pixel, no Google Tag (GA4), and no conversion event tracking for key business actions.

## Files Inspected
- `apps/web/index.html` (Base script entry)
- `apps/web/src/main.tsx` (App initialization)
- `apps/web/src/App.tsx` (Routing and high-level logic)
- `apps/web/src/firebase.ts` (Firebase config - Auth only)
- `apps/web/src/pages/Home.tsx` (Landing page)
- `apps/web/src/components/HomeHero.jsx` (Hero section)
- `apps/web/src/components/Navbar.jsx` (Navigation)
- `apps/web/src/components/Footer.jsx` (Footer)
- `apps/web/src/pages/Billing.tsx` (Pricing/Billing)
- `apps/web/package.json` (Dependencies check)

## What Exists
- **Feature Clarity**: The landing page clearly explains the core product suite: Label Generation, Money Orders, Bulk Tracking, and Complaint Management.
- **Conversion Paths**: "Start Free" and "Buy Now" paths are logically laid out.
- **WhatsApp Integration**: Basic WhatsApp sharing for tracking IDs exists, but no marketing contact link.

## What Is Missing
- **Meta Pixel**: Entirely missing. No `fbq` initialization or events.
- **GA4 / Google Tag**: Entirely missing. No `gtag` or measurement IDs found.
- **Conversion Tracking**: Actions like registration, plan selection, and payment initiation are not reported to any analytics provider.
- **Central Analytics Helper**: No unified service for managing event dispatching.
- **WhatsApp Marketing Link**: No "Chat with us" or "WhatsApp Demo" link in Navbar/Footer.

## Risk Level
- **Medium (Marketing Blindness)**: While the app functions perfectly, the marketing team cannot measure ROI on ads, cannot retarget users who drop off at registration, and has no data on which plans are most viewed vs. purchased.
- **Privacy Safety**: Currently **Low Risk** as no data is being sent anywhere, but must ensure future implementation avoids sending PII (CNIC, Phone, Addresses).

## Recommended Minimal Implementation Plan
1. **Infrastructure**: Create `apps/web/src/lib/analytics.ts` to house all tracking logic (GTM/GA4/Pixel).
2. **Initialization**: Load scripts in `index.html` using environment variables for IDs.
3. **Core Events**: Implement `PageView` and `lead_start` (Register click).
4. **Conversion Events**: Track `CompleteRegistration`, `PurchaseInit` (JazzCash/Manual click), and `PurchaseSuccess`.

## Exact Protected Scope
- **Do NOT modify**: Auth guards, Payment processing logic, Shipment DB operations, PDF generation service, or Tracking engine.

## Events to Add
| Event | Trigger | Category |
|-------|---------|----------|
| `page_view` | Route change | Awareness |
| `whatsapp_demo_click` | WhatsApp link click | Interest |
| `start_free_click` | "Start Free" button click | Interest |
| `registration_complete` | Success on /register | Conversion |
| `file_upload` | Successful file drop in /upload | Engagement |
| `label_generated` | Job success | Engagement |
| `pricing_view` | Visit /billing or /pricing | Interest |
| `plan_select` | Click "Buy Now" or "Pay with..." | Intent |
| `payment_initiate` | JazzCash/Manual payment start | Conversion |
| `payment_success` | Verification of payment success | Revenue |

## Files Likely Needing Change
- `apps/web/index.html` (Script tags)
- `apps/web/src/lib/analytics.ts` (New file)
- `apps/web/src/pages/Register.tsx` (Success callback)
- `apps/web/src/pages/Billing.tsx` (Payment callbacks)
- `apps/web/src/pages/Home.tsx` / `HomeHero.jsx` (CTA clicks)
- `apps/web/src/components/Navbar.jsx` / `Footer.jsx` (Link clicks)

## Testing Checklist
- [ ] Verify GA4 Realtime shows events.
- [ ] Verify Meta Pixel Helper extension detects Pixel.
- [ ] Verify NO sensitive data (CNIC, Address) is in event payloads.
- [ ] Verify tracking does not block app loading if scripts fail.
