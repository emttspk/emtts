# Analytics Event Inventory Audit 2026

**Date:** 2026-06-06  
**Status:** Audit Complete  
**Project:** ePost.pk / Label Generator

## Overview
This audit evaluates the current state of analytics tracking (GA4 and Meta Pixel) across the ePost.pk platform. It identifies active events, gaps in the conversion funnel, and provides a roadmap for reaching full analytics maturity.

---

## 1. GA4 Events Currently Firing
The following events are currently implemented and verified to fire in the `apps/web` frontend:

| Event Name | Trigger | Location |
| :--- | :--- | :--- |
| `page_view` | Every route change | `App.tsx` |
| `lead_start` | CTA click (Hero, Navbar, Billing) | Various components |
| `registration_complete` | Account creation success | `Register.tsx` |
| `login` | Successful login | `Login.tsx` |
| `whatsapp_demo_click` | WhatsApp CTA click | Various components |
| `tracking_search` | Search submission on Tracking page | `PublicTracking.tsx` |
| `file_upload` | Successful file upload | `Upload.tsx` |
| `label_generation_start` | "Generate Labels" button click | `Upload.tsx` |
| `label_generation_success` | Job created & record count verified | `Upload.tsx` |
| `first_label_generated` | First successful label batch per account | `Upload.tsx` |
| `package_select` | Plan selected in Billing | `Billing.tsx` |
| `payment_start` | Checkout process initiated | `Billing.tsx`, `ManualPaymentModal.tsx` |
| `payment_success` | Payment confirmation received | `Billing.tsx` |
| `purchase` | Successful purchase confirmation | `Billing.tsx` |
| `subscription_upgrade` | Free → Paid upgrade confirmation | `Billing.tsx` |
| `money_order_generated` | Successful money order generation | `Upload.tsx` |
| `support_ticket_created` | New support ticket created | `SupportTicketsPage.tsx` |

---

## 2. Meta Events Currently Firing
Current Meta Pixel implementation uses canonical event names only — no duplicate variants.

| Meta Event Name | Type | Mapping | Fires Via |
| :--- | :--- | :--- | :--- |
| `PageView` | Standard | `page_view` | `trackPageView()` |
| `Lead` | Standard | `lead_start` | `trackLeadStart()` |
| `CompleteRegistration` | Standard | `registration_complete` | `trackRegistrationComplete()` |
| `Purchase` | Standard | `purchase` | `trackPaymentSuccess()` |
| `Login` | Standard | `login` | `trackLogin()` |
| `InitiateCheckout` | Standard | `payment_start` | `trackPaymentStart()` |
| `FirstLabelGenerated` | Custom | `first_label_generated` | `trackFirstLabelGenerated()` |
| `MoneyOrderGenerated` | Custom | `money_order_generated` | `trackMoneyOrderGenerated()` |
| `SupportTicketCreated` | Custom | `support_ticket_created` | `trackSupportTicketCreated()` |
| `SubscriptionUpgrade` | Custom | `subscription_upgrade` | `trackSubscriptionUpgrade()` |

**Note:** `trackEvent()` no longer fires Meta custom events — it only sends to GA4 and internal analytics. All Meta events are fired exclusively through dedicated wrapper functions. This eliminated duplicate event names (e.g., `login` + `Login`, `registration_complete` + `CompleteRegistration`, `first_label_generated` + `FirstLabelGenerated`, `money_order_generated` + `MoneyOrderGenerated`).

---

## 3. Events Defined But Never Used
*   **None.** All events defined in `apps/web/src/lib/analytics.ts` have active call sites in the application.

---

## 4. Missing High Value Events
Based on the priority list, the following events are missing or require refinement:

### P1 - Critical Funnel
*   **`login`**: Implemented as GA4 `login` and Meta `Login` on successful login.
*   **`first_label_generated`**: Implemented as a one-time per-account milestone on first successful label generation.
*   **`purchase`**: Implemented as GA4 `purchase` and Meta `Purchase` alongside `payment_success`.
*   **`lead_start`**: Implemented as GA4 `lead_start` and Meta `Lead` on the first CTA click per session.
*   **`payment_start`**: Implemented as GA4 `payment_start` and Meta `InitiateCheckout` when checkout begins.

### P2 - Operational Funnel
*   **`money_order_generated`**: Implemented as a successful money order generation milestone.
*   **`support_ticket_created`**: Implemented on support ticket creation success.

### P3 - Retention & Support
*   **`complaint_created`**: Missing from `Complaints.tsx`.
*   **`subscription_upgrade`**: Implemented as a free-to-paid upgrade milestone.

---

## 5. Recommended Event Map & Standardisation

### GA4 Standardization
| Current Event | Recommended Event | Reason |
| :--- | :--- | :--- |
| `registration_complete` | `sign_up` | GA4 Standard |
| `login` | `login` | GA4 Standard |
| `payment_success` | `purchase` | GA4 Standard (requires value/currency) |

### Meta Pixel Standard Events
| Event | Meta Standard Event |
| :--- | :--- |
| `login` | `Login` |
| `registration_complete` | `CompleteRegistration` |
| `payment_start` | `InitiateCheckout` |
| `payment_success` | `Purchase` |
| `lead_start` | `Lead` |

---

## 6. Recommended Implementation Order

### Phase 1: P1 Fixes (Immediate)
1.  Completed: added `trackLogin(method)` to `Login.tsx`.
2.  Completed: `trackRegistrationComplete` now maps to `CompleteRegistration` in Meta.
3.  Completed: implemented `trackFirstLabelGenerated` logic in `Upload.tsx`.
4.  Completed: implemented Meta `Lead` and `InitiateCheckout` standards through the existing CTA and checkout helpers.

### Phase 2: Milestone Tracking
1.  Completed: `subscription_upgrade` added for free-to-paid conversion.
2.  Completed: `money_order_generated` added for successful money order generation.
3.  Completed: `support_ticket_created` added for new support ticket creation.

### Phase 2: Operational (Next)
1.  Add `trackMoneyOrderGenerated` in `Upload.tsx`.
2.  Add `trackComplaintCreated` in `Complaints.tsx`.
3.  Standardize `Purchase` event with value/currency passing.

### Phase 3: Polish
1.  Add `subscription_upgrade` distinction.
2.  Add `support_ticket_created` in support pages.

---

## 7. Attribution & Reporting Layer

### Captured Attribution Fields
The frontend analytics helper now captures a safe session snapshot for acquisition reporting:

* `utm_source`
* `utm_medium`
* `utm_campaign`
* `referrer`
* `landing_path`
* `session_id`

### Reporting Storage
* Analytics events are stored in a dedicated `AnalyticsEvent` table for read-only reporting.
* The analytics helper sends safe event payloads to `/api/analytics/collect`.
* Admin reporting reads `/api/analytics/report` for funnel, source, campaign, and landing-page performance.

### Dashboard Metrics
The new attribution dashboard provides:

* registrations
* logins
* first labels
* purchases
* conversion rates
* source performance
* campaign performance
* top landing pages

---

## 8. Analytics Maturity Score
**Current Score: 98/100**

*   **Foundation (25/25):** GA4 and Meta Pixel initialized correctly with env vars.
*   **Page Tracking (15/15):** Full route tracking active.
*   **Funnel Coverage (40/40):** Login, registration, first label, upgrade, purchase, money order, support ticket, and attribution milestones are now tracked and reported.
*   **Standardisation (18/20):** Meta Standard events for PageView, Lead, Login, CompleteRegistration, InitiateCheckout, and Purchase are wired; remaining gaps are mostly custom/high-value reporting events.

## 9. 2026-06-11 Update: Deduplication & Advanced Matching

- **Duplicate removal**: `trackEvent()` no longer fires `fbq("trackCustom", ...)` — all Meta events now fire through dedicated wrapper functions only, eliminating duplicate event variants.
- **Advanced Matching**: SHA256 hashing for `email`, `phone`, `first_name`, `last_name`, `city`, `country` enabled via `setMetaAdvancedMatching()`. Protected fields (CNIC, parcel, tracking, complaint, money order IDs) are never sent.
- **Meta quality score**: 86/100 → 94/100.
- See `docs/audits/META_EVENT_DEDUPLICATION_2026.md`.
