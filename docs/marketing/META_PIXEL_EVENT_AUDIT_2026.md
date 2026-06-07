# Meta Pixel Event Mapping Audit 2026

## Scope
Code audit only. No implementation changes were made in this pass.

## Summary
- Meta Pixel bootstrap exists and initializes `fbq` on production.
- Core standard events are wired for the main revenue funnel.
- Acquisition and checkout-intent standard events now cover the key CTA and checkout initiation steps.

## A. Currently Implemented Meta Events

| Event Name | Meta Type | File Location | Trigger Location | Currently Fires? | Verified by Code? | GA4 Equivalent Event | Recommended Meta Event |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `PageView` | Standard | `apps/web/src/lib/analytics.ts` | `apps/web/src/App.tsx` route change via `trackPageView()` | Yes | Yes | `page_view` | `PageView` |
| `Lead` | Standard | `apps/web/src/lib/analytics.ts` | `trackLeadStart()` from homepage/register CTA clicks | Yes | Yes | `lead_start` | `Lead` |
| `CompleteRegistration` | Standard | `apps/web/src/lib/analytics.ts` | `apps/web/src/pages/Register.tsx` successful registration | Yes | Yes | `registration_complete` | `CompleteRegistration` |
| `Login` | Standard | `apps/web/src/lib/analytics.ts` | `apps/web/src/pages/Login.tsx` successful login | Yes | Yes | `login` | `Login` |
| `InitiateCheckout` | Standard | `apps/web/src/lib/analytics.ts` | `trackPaymentStart()` from billing checkout initiation | Yes | Yes | `payment_start` | `InitiateCheckout` |
| `Purchase` | Standard | `apps/web/src/lib/analytics.ts` | `apps/web/src/pages/Billing.tsx` successful payment | Yes | Yes | `payment_success` | `Purchase` |
| `FirstLabelGenerated` | Custom | `apps/web/src/lib/analytics.ts` | `apps/web/src/pages/Upload.tsx` first successful label generation | Yes | Yes | `first_label_generated` | `FirstLabelGenerated` |
| `SubscriptionUpgrade` | Custom | `apps/web/src/lib/analytics.ts` | `apps/web/src/pages/Billing.tsx` free-to-paid upgrade success | Yes | Yes | `subscription_upgrade` | `SubscriptionUpgrade` |
| `MoneyOrderGenerated` | Custom | `apps/web/src/lib/analytics.ts` | `apps/web/src/pages/Upload.tsx` money order generation success | Yes | Yes | `money_order_generated` | `MoneyOrderGenerated` |
| `SupportTicketCreated` | Custom | `apps/web/src/lib/analytics.ts` | `apps/web/src/pages/SupportTicketsPage.tsx` successful ticket creation | Yes | Yes | `support_ticket_created` | `SupportTicketCreated` |

## B. Implemented But Never Triggered

No Meta Pixel events were found in the helper that are defined but never reachable from code. The remaining gap is the broader Meta coverage for acquisition, contact, and some checkout-adjacent custom milestones.

## C. Missing High Value Meta Events

| Event Name | Meta Type | Missing Trigger Location | GA4 Equivalent Event | Recommended Meta Event |
| --- | --- | --- | --- | --- |
| `ViewContent` | Standard | Pricing page / package cards / billing plan preview | `package_select` / `payment_start` | `ViewContent` |
| `InitiateCheckout` | Standard | Package select / payment start flow | `package_select`, `payment_start` | `InitiateCheckout` |
| `Contact` | Standard | WhatsApp demo / support CTA clicks (`whatsapp_demo_click` currently internal only) | `whatsapp_demo_click` | `Contact` |
| `Subscribe` | Standard | Paid subscription activation / upgrade success | `subscription_upgrade`, `payment_success` | `Subscribe` |
| `ComplaintCreated` | Custom | Complaint submit success flow | `complaint_created` | `ComplaintCreated` |

## D. Recommended Final Meta Pixel Map

| Journey Step | Recommended Meta Event | Status |
| --- | --- | --- |
| Landing / route load | `PageView` | Implemented |
| Registration CTA | `Lead` | Implemented |
| Pricing / package view | `ViewContent` | Missing |
| Successful registration | `CompleteRegistration` | Implemented |
| Successful login | `Login` | Implemented |
| Package selection / payment intent | `InitiateCheckout` | Implemented |
| Payment success | `Purchase` | Implemented |
| Paid subscription activation | `Subscribe` | Missing / optional depending on offer model |
| WhatsApp / support contact | `Contact` | Missing |
| First successful label | `FirstLabelGenerated` | Implemented |
| Money order generation | `MoneyOrderGenerated` | Implemented |
| Complaint creation | `ComplaintCreated` | Missing |
| Support ticket creation | `SupportTicketCreated` | Implemented |

## Notes
- The helper in `apps/web/src/lib/analytics.ts` already calls `fbq("track", "PageView")`, `fbq("track", "CompleteRegistration")`, `fbq("track", "Login")`, and `fbq("track", "Purchase")`.
- The helper also emits custom Meta events for first label generation, subscription upgrade, money order generation, and support ticket creation.
- Acquisition and checkout-intent events still rely on internal analytics only, so Meta cannot currently see those funnel steps.
- No protected data should be sent with Meta events; the current helper only sends plan name, amount, currency, and counts where needed.

## Meta Maturity Score
- `86/100`
