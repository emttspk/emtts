# Marketing Tracking Audit Report - 2026-06-04

## Implementation Update (2026-06-04)

- Minimal analytics foundation implemented:
	- Added central analytics helper at `apps/web/src/lib/analytics.ts`.
	- Added environment-based initialization for `VITE_GA_MEASUREMENT_ID` and `VITE_META_PIXEL_ID` (no hardcoded IDs).
	- Wired safe events only in this pass: `page_view`, `lead_start`, `tracking_search`, `whatsapp_demo_click`.
	- Event payload policy enforced to safe generic keys only (`source`, `count`, `path`, etc.) with no PII.

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
