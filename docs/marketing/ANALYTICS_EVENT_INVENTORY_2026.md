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
| `package_select` | Plan selected in Billing | `Billing.tsx` |
| `payment_start` | Checkout process initiated | `Billing.tsx`, `ManualPaymentModal.tsx` |
| `payment_success` | Payment confirmation received | `Billing.tsx` |
| `purchase` | Successful purchase confirmation | `Billing.tsx` |

---

## 2. Meta Events Currently Firing
Current Meta Pixel implementation primarily uses `trackCustom` for all non-pageview events.

| Meta Event Name | Type | Mapping |
| :--- | :--- | :--- |
| `PageView` | Standard | `page_view` |
| `Login` | Standard | `login` |
| `CompleteRegistration` | Standard | `registration_complete` |
| `Purchase` | Standard | `purchase` |
| (Custom Events) | Custom | All other GA4 events listed above |

---

## 3. Events Defined But Never Used
*   **None.** All events defined in `apps/web/src/lib/analytics.ts` have active call sites in the application.

---

## 4. Missing High Value Events
Based on the priority list, the following events are missing or require refinement:

### P1 - Critical Funnel
*   **`login`**: Implemented as GA4 `login` and Meta `Login` on successful login.
*   **`first_label_generated`**: Current `label_generation_success` fires for every job. We lack a "First Success" milestone event.
*   **`purchase`**: Implemented as GA4 `purchase` and Meta `Purchase` alongside `payment_success`.

### P2 - Operational Funnel
*   **`money_order_generated`**: No specific event for the Money Order generation sub-flow.
*   **`support_ticket_created`**: Missing from support/complaint pages.

### P3 - Retention & Support
*   **`complaint_created`**: Missing from `Complaints.tsx`.
*   **`subscription_upgrade`**: No distinction between initial purchase and upgrade.

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
3.  Pending: implement `trackFirstLabelGenerated` logic in `Upload.tsx`.

### Phase 2: Operational (Next)
1.  Add `trackMoneyOrderGenerated` in `Upload.tsx`.
2.  Add `trackComplaintCreated` in `Complaints.tsx`.
3.  Standardize `Purchase` event with value/currency passing.

### Phase 3: Polish
1.  Add `subscription_upgrade` distinction.
2.  Add `support_ticket_created` in support pages.

---

## 7. Analytics Maturity Score
**Current Score: 82/100**

*   **Foundation (25/25):** GA4 and Meta Pixel initialized correctly with env vars.
*   **Page Tracking (15/15):** Full route tracking active.
*   **Funnel Coverage (28/40):** Login, registration, and purchase now fire on successful conversion paths; first-generation milestone still needs a dedicated first-time event.
*   **Standardisation (14/20):** Meta Standard events for Login, CompleteRegistration, and Purchase are now wired; GA4 login and purchase are standardised as well.
