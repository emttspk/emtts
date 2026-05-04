# EP Gateway: SaaS Integration Options (Based on PDF Review)

Date: 2026-05-03
Source documents reviewed:
- API Integration Guide without RSA.pdf
- Checkout.pdf
- Easypaisa Mobile Account MA API Integration Guide with RSA.pdf
- Inquire Mobile Account Integration Guide with RSA.pdf
- Pinless MA Pre Check.pdf
- QR .pdf

## 1) Systems You Can Integrate With Your SaaS

1. E-commerce websites and web stores
- Hosted checkout (embedded JavaScript + iFrame) for web checkout flows.
- Direct server-to-server APIs for payment initiation and status inquiry.

2. Mobile applications
- Mobile app checkout using hosted checkout URL flow or backend API orchestration.
- MA (Mobile Account) payment APIs can be driven from app backend services.

3. ERP / Order Management Systems (OMS)
- Use orderId, storeId, amount based transaction initiation APIs.
- Inquire Transaction API can reconcile transaction states back into ERP/OMS.

4. Billing and subscription systems
- Server-side API-based collection for invoices/subscriptions.
- IPN/Postback callbacks can update billing records asynchronously.

5. Merchant portals and partner dashboards
- Merchant-facing status dashboards using Inquire Transaction API.
- Payment operations and settlement visibility using transaction status sync.

6. Retail / in-store payment systems
- Generate QR API supports QR-based customer payment collection use cases.
- Can integrate with POS-like systems through backend service layer.

7. Tokenized pinless payment workflows
- Pinless MA Pre-check API supports token-based mobile account payment prechecks.
- Suitable for repeat customer payment experiences where PIN prompt is avoided.

## 2) Integration Modes Supported

1. Hosted Checkout mode
- Easypaisa hosted checkout can be embedded in merchant UI.
- Includes postback URL and IPN support for asynchronous payment updates.
- Checkout guide also references optional RSA signing in hosted flow.

2. Direct REST API mode (without RSA)
- Initiate OTC Transaction
- Initiate MA Transaction
- Inquire Transaction Status
- Uses HTTPS with credential-based authentication (Base64 username:password per guide).

3. Direct REST API mode (with RSA 2048)
- MA initiation/inquiry and QR API documentation use RSA signature model.
- Requires key exchange via merchant portal (upload merchant public key).
- Signature generation/verification expected on request/response.

## 3) Payment Channels/Methods Observed in Docs

- Easypaisa Mobile Account (MA)
- OTC (Over the Counter) flow
- QR payments (Generate QR API)
- Pinless MA precheck flow
- Checkout guide also mentions card/internet-banking channels (CC/DD/IB) in hosted checkout context

## 4) Key Technical Building Blocks for Your SaaS

1. API Gateway + Payment Adapter service
- Build a dedicated adapter in your SaaS backend for EP Gateway APIs.

2. Webhook/IPN receiver service
- Consume IPN/postback to keep transaction states updated in real time.

3. Security module
- Support both auth modes:
  - Credential header mode (non-RSA APIs)
  - RSA-2048 signing/verification mode (RSA APIs)

4. Reconciliation jobs
- Scheduled status inquiry for delayed/failed callback scenarios.

5. Tenant-aware config
- Per-merchant storeId/credentials/keys in a secure vault.

## 5) Recommended SaaS Integration Architecture

1. Start with Hosted Checkout for fastest go-live
- Best for reduced PCI/security complexity and quick merchant onboarding.

2. Add Direct API mode for enterprise tenants
- Needed for custom UX and deeper backend orchestration.

3. Add optional modules by vertical
- QR module for retail/in-store scenarios.
- Pinless MA module for repeat-customer payment optimization.

4. Enforce event-driven status handling
- IPN/postback first, periodic inquiry as fallback.

## 6) Practical Scope Suggestion (Phase-wise)

Phase 1:
- Hosted checkout
- Postback + IPN
- Transaction inquiry sync

Phase 2:
- MA + OTC direct APIs
- RSA signing framework for secure API variants

Phase 3:
- QR API
- Pinless MA precheck
- Advanced reconciliation and analytics

## 7) Notes and Caveats

- Some URL strings in extracted text are truncated in the PDFs; use official merchant credentials/environment docs to confirm exact production/staging endpoints before development.
- RSA guides strongly indicate 2048-bit key exchange and signature verification on both request and response paths.
- For production, confirm IP whitelisting, timeout/retry policy, idempotency behavior, and response code mapping with Easypaisa onboarding/support.

## 8) Option 2 Detailed Documentation

For the complete Option 2 package/tier design and implementation documentation, see:

- docs/README.md
- docs/Option2_SaaS_Tier_Design_and_Documentation.md
- docs/Option2_Implementation_Backlog.csv
