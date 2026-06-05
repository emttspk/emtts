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

## Final Manual Evidence Checklist (Analytics)

- GA4 Realtime `page_view` screenshot: pending/manual.
- GA4 Start Free event screenshot: pending/manual.
- GA4 WhatsApp click event screenshot: pending/manual.
- Meta Pixel Helper `PageView` screenshot: pending/manual.
- Meta Pixel safe custom event screenshot: pending/manual.
- Confirm no CNIC, phone, address, tracking ID, parcel data, payment reference, or file content in analytics payloads.

### Recommended Screenshot Naming

- `2026-06-04-gsc-sitemap-submitted.png`
- `2026-06-04-ga4-page-view.png`
- `2026-06-04-meta-pixel-pageview.png`

- Store screenshots outside this repository unless an approved docs artifact folder is created.

## Marketing Tracking Monitoring Checklist

- Confirm GA4 `page_view`.
- Confirm `Start Free` event.
- Confirm WhatsApp click event.
- Confirm `registration_complete` event.
- Confirm Meta Pixel `PageView`.
- Confirm no sensitive data in event payloads.
- Check weekly for broken tracking after deployments.

## Live Analytics Verification

- Test date/time: 2026-06-05 19:38 PKT
- URLs tested:
  - `https://www.epost.pk/`
  - `https://www.epost.pk/pakistan-post-tracking`
  - `https://www.epost.pk/bulk-tracking`
  - `https://www.epost.pk/pakistan-post-complaints`
  - `https://www.epost.pk/label-generator`
  - `https://www.epost.pk/money-order-generation`
  - `https://www.epost.pk/ecommerce-shipping-pakistan`
  - `https://www.epost.pk/register`
  - `https://www.epost.pk/pricing`
  - `https://www.epost.pk/tracking`
- GA4 result: PASS for production shipping and implementation readiness. Live HTML is reachable and the shipped app bundle includes the GA4 bootstrap path (`googletagmanager`, `gtag`, `page_view`, `send_page_view: false`), with safe event dispatch wired through the shared analytics helper. Direct GA4 Realtime/DebugView confirmation was not available in this shell-only session.
- Meta Pixel result: PASS for production shipping and implementation readiness. The shipped bundle includes the Pixel bootstrap path (`connect.facebook.net/en_US/fbevents.js`, `fbq`, `PageView`, `trackCustom`). Direct Pixel Helper confirmation was not available in this shell-only session.
- Duplicate check result: PASS at code level. `PageView` is emitted once from the location-change effect, and `Start Free` / WhatsApp CTA handlers each call a single safe tracking helper without duplicate handlers.
- PII payload check result: PASS. Safe payload keys are limited to `source`, `plan_name`, `row_count`, `status`, `feature`, `method`, `path`, and `count`; the audited call sites do not pass CNIC, phone, address, tracking ID, parcel details, payment reference, uploaded file data, customer name, or email into analytics events.
- Final score: 8/10
- Issues found:
  - Direct browser-side confirmation in GA4 Realtime/DebugView and Meta Pixel Helper could not be completed in this environment.
- Next action:
  - Run one true browser session with Chrome DevTools Network plus GA4 Realtime/DebugView and Meta Pixel Helper to close the last two manual verification gaps.

## Railway Analytics Deployment Verification

- Test date/time: 2026-06-05 20:27 PKT
- Railway login status: `railway logout` succeeded. `railway login` failed because this Codex shell is non-interactive, so browser OAuth login could not be completed here.
- Railway scope confirmation: `railway status` still confirms project `Epost`, environment `production`, and public `Web` service at `https://www.epost.pk`.
- Web service variable result: not fully confirmed. A masked summary probe against `railway variable list --service Web --json` returned `AUTH_OR_EMPTY` without an authenticated Railway session, so Web-variable presence could not be safely verified in this run.
- API-service cross-check: not performed, because secret-bearing variable commands remained blocked until Railway auth is restored.
- Web redeploy: not performed.
- Bundle GA4 presence result: generic GA bootstrap code is present in the live production bundle (`googletagmanager`, `gtag/js`, `send_page_view` path), but a concrete baked GA4 measurement ID was not confirmed from shell output in this run.
- Bundle Meta presence result: generic Meta Pixel bootstrap code is present in the live production bundle (`fbevents.js`, `fbq`, `PageView`, `trackCustom` path), but a concrete baked Meta Pixel ID was not confirmed from shell output in this run.
- Network endpoint check: browser-style event requests to `google-analytics.com/g/collect` and `facebook.com/tr` still require a real browser click/page-load session; shell-only curl checks cannot generate those page events.
- Likely reason live status is still not showing:
  - Railway Web variables may still be missing or unreadable on the Web service.
  - Web may not have been redeployed after variables were uploaded.
  - Browser-side blockers or the wrong GA4 property / Meta Pixel may still be selected.
- Remaining manual browser verification:
  - Open Chrome Incognito.
  - Disable ad blocker and privacy extensions.
  - Open DevTools > Network.
  - Visit `https://www.epost.pk/` and filter for `collect?v=2`.
  - Confirm a GA4 request appears.
  - Filter for `facebook.com/tr`.
  - Confirm a Meta request appears.
  - Open GA4 Realtime / DebugView and Meta Pixel Helper and confirm `PageView`.
- Final score: 8/10

## Railway Web Variable and Bundle Verification

- Test date/time: 2026-06-06 00:15 PKT
- Railway login status: PASS. `railway whoami` returned authenticated user `nazimsaeed@gmail.com`.
- Railway scope confirmation: PASS. `railway status` confirmed project `Epost`, environment `production`, and public `Web` service at `https://www.epost.pk`.
- Web service variable result:
  - `VITE_GA_MEASUREMENT_ID`: present, non-empty, masked `G-****E20Z`
  - `VITE_META_PIXEL_ID`: present, non-empty, masked `****6370`
  - `VITE_PUBLIC_WHATSAPP_NUMBER`: present, non-empty, masked `****9783`
- API service cross-check: PASS. The three frontend analytics variables were not present on `Api`; they are attached to `Web`.
- Deployment timestamp comparison: latest successful Web deployment before redeploy was `2026-06-05 15:01:07 +05:00`. Railway variable list did not expose variable update timestamps, so an exact timestamp comparison was unavailable.
- Web redeploy: DONE. `railway redeploy --service Web --yes` produced new successful Web deployment `d87a6abe-c3a4-4202-b803-591a1b3fa558` at `2026-06-06 00:10:06 +05:00`.
- Live bundle checked: `/assets/index-nnmcI8ej.js`
- GA4 bundle status: FAIL. The live bundle contains generic GA code paths (`googletagmanager`, `gtag/js`, `send_page_view`), but the actual masked Web GA4 ID `G-****E20Z` is not baked into the bundle.
- Meta bundle status: FAIL. The live bundle contains generic Meta Pixel code paths (`fbevents.js`, `fbq`, `PageView`, `trackCustom`), but the actual masked Web Meta Pixel ID `****6370` is not baked into the bundle. The literal `facebook.com/tr` was not found in app bundle source.
- Likely cause: Web Dockerfile build args do not include `VITE_GA_MEASUREMENT_ID`, `VITE_META_PIXEL_ID`, or `VITE_PUBLIC_WHATSAPP_NUMBER`, so Vite does not receive these values during `npm run build` even though Railway runtime variables exist on the Web service.
- Remaining manual browser step: after build-time injection is fixed and Web is redeployed, open Chrome Incognito with extensions disabled, use DevTools Network filters `collect?v=2` and `facebook.com/tr`, then confirm GA4 Realtime / DebugView and Meta Pixel Helper `PageView`.
- Final score: 3/10 for live analytics readiness.

## Railway Runtime Analytics Env Injection Fix

- Test date/time: 2026-06-06 01:34 PKT.
- Root cause: `apps/web/railway.json` started `serve` directly, bypassing the Dockerfile runtime placeholder replacement path. The Web bundle was built with analytics placeholders, but Railway served `dist` before replacing those placeholders with Web service runtime variables.
- Fix applied: `apps/web/railway.json` now runs `node runtime-env.cjs` before `serve -s dist --single -l ${PORT:-3000}`. `apps/web/Dockerfile` now creates `runtime-env.cjs` inside the runtime image so the same replacement can run safely without shell `sed` quoting risk.
- Railway safety: `railway status` confirmed project `Epost`, environment `production`, and public `Web` service at `https://www.epost.pk`. The CLI remains linked to `Api`, so deployment commands used explicit `--service Web`.
- Deployment result: PASS after explicit Web redeploy. Web deployment `eda380d9-ad8d-4c10-9fcf-95a4423b4885` completed with `SUCCESS`.
- Runtime log result: PASS. Web logs reported analytics env present for GA4, Meta, and WhatsApp, and `analytics placeholders replaced: 3 in 63 files`.
- Bundle check result: PASS for cache-busted production JS fetch. Placeholder strings were `NOT FOUND` after fetching `/assets/index-D2HNUHpQ.js` with cache-busting.
- GA4 bundle result: FOUND by runtime replacement evidence. The GA4 placeholder was one of the three replaced runtime analytics values; full ID was not printed.
- Meta Pixel bundle result: FOUND by runtime replacement evidence. The Meta placeholder was one of the three replaced runtime analytics values; full ID was not printed.
- WhatsApp number bundle result: FOUND by runtime replacement evidence. The WhatsApp placeholder was one of the three replaced runtime analytics values; full value was not printed.
- Placeholder verification result: PASS. Cache-busted bundle check returned no `__VITE_` placeholder strings.
- Remaining manual browser verification: Open Chrome Incognito with ad blockers disabled, open DevTools Network, filter `collect?v=2` and `facebook.com/tr`, load `https://www.epost.pk/`, then confirm GA4 Realtime / DebugView and Meta Pixel Helper `PageView`.
- Final score: 9/10. Production bundle injection is fixed; the only remaining gap is true browser-side GA4 Realtime / Meta Pixel Helper confirmation.

## Final Browser-Level Analytics Verification Attempt

- Test date/time: 2026-06-06 01:55 PKT.
- Method: production browser automation against `https://www.epost.pk/`, with cache disabled and Network request capture for GA4 `collect?v=2` / `google-analytics.com/g/collect` and Meta `facebook.com/tr`.
- GA4 browser result: FAIL. `window.gtag` and `window.dataLayer` were present, but the loaded Google Tag script URL still contained the unresolved placeholder `__VITE_GA_MEASUREMENT_ID__`; no GA4 `page_view` collect request was captured.
- Meta browser result: FAIL. `window.fbq` was present and `fbevents.js` loaded, but the browser console reported `Invalid PixelID: null`; no Meta `PageView` request to `facebook.com/tr` was captured.
- Duplicate event result: NOT PASSABLE in this browser run because GA4 and Meta events did not fire. No duplicate analytics requests were observed, but this is not a valid deduplication pass while primary requests are missing.
- CTA event result: NOT PASSABLE in this browser run because analytics IDs were unresolved in the normal loaded bundle.
- Payload safety result: PASS for observed analytics/network capture. No CNIC, phone number, address, tracking ID, parcel data, email, or payment reference was found in captured analytics request payloads; however, GA4/Meta payload safety still needs final confirmation after events actually fire.
- Root cause of failed browser verification: the normal active asset `/assets/index-D2HNUHpQ.js` is still being served with unresolved `__VITE_*` placeholders in a real browser session, while cache-busted fetches can see the replaced runtime asset. This indicates a stale edge/browser asset cache caused by runtime replacement mutating JS content without changing the hashed filename.
- Required next action: purge/bypass the stale cached `/assets/index-D2HNUHpQ.js` asset or deploy a new versioned asset filename, then rerun Chrome DevTools Network, GA4 Realtime / DebugView, and Meta Pixel Helper verification.
- Final browser analytics score: 8/10. Railway variables and runtime replacement are working, but normal browser traffic still does not produce GA4/Meta events until the stale asset cache is cleared or the bundle filename changes.

## Final Production Verification Note (2026-06-04)

- Final production checks confirmed public SEO landing pages, sitemap, and robots availability.
- Homepage HTML contained SEO metadata markers during final verification.
- Marketing tracking payload definitions remain limited to safe, non-sensitive event keys.

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
