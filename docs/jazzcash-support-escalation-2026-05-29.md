# JazzCash Support Escalation Packet (Sandbox)

## 2026-06-01 Alignment + Live Retest Addendum

Support-shared successful sandbox payload has now been implemented exactly in app outbound Mobile Wallet requests.

### Implemented Alignment

- Endpoint confirmed: `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
- Mobile Wallet field set reduced to support sample fields only.
- Mobile Wallet txn reference reverted to `TYYYYMMDDHHMMSS`.
- Mobile Wallet expiry moved to `TxnDateTime + 7 days`.
- Removed fields from Mobile Wallet create request:
   - `pp_CNIC`, `pp_BankID`, `pp_ProductID`, `pp_SubMerchantID`, `pp_DiscountedAmount`, `ppmpf_2..ppmpf_5`

### Direct Support-Payload Diagnostic Result

Using `scripts/jazzcash-mobile-wallet-support-payload-check.mjs` with env credentials:

- HTTP: `200`
- `pp_ResponseCode`: `000`
- `pp_ResponseMessage`: `Thank you for Using JazzCash, your transaction was successful.`

### App Live Matrix Retest (Authenticated)

- `03123456789`
   - create HTTP `201`
   - provider code `000`
   - txnRefNo `T20260601174441`
   - status inquiry: `completed`
- `03123456780`
   - create HTTP `201`
   - provider code `199`
   - txnRefNo `T20260601174452`
   - status inquiry: `failed`
- `03123456781`
   - create HTTP `201`
   - provider code `999`
   - txnRefNo `T20260601174500`
   - status inquiry: `failed`

### Open Runtime Observation

For provider `000`, immediate `GET /api/payments/jazzcash/status/:txnRefNo` can still show `FAILED` while inquiry indicates success. Additional provider-response reconciliation may still be needed if strict immediate status parity is required.

## Merchant

- Merchant ID: MC771933

## Endpoint Under Test

- https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction

## Integration Scope

- Mobile Wallet API only (REST one-time flow)
- Hosted checkout fallback is not used in our user-facing flow

## Issue Summary

Mobile Account API v1.1 request reaches JazzCash but returns:

- pp_ResponseCode: 199
- pp_ResponseMessage: Sorry! Your transaction was not successful. Please try again later.

## Evidence

1. Same result from our backend live integration (hash-valid requests): code 199.
2. Same result from JazzCash sandbox API Testing page: code 199 with same message.
3. pp_SecureHash validation issue is already resolved for current one-time payload shape.
4. Requests reach provider and return pp_RetreivalReferenceNo.
5. Focused DoTransaction matrix across:
   - amounts (500, 1000, 250000),
   - mobiles (03123456789, 03123456780, 03123456781),
   - request encodings and optional ppmpf shape,
   all produce deterministic code 199 when hash-valid.

## Current Hash-Valid Field Set

- pp_Amount
- pp_BillReference
- pp_Description
- pp_Language
- pp_MerchantID
- pp_Password
- pp_ReturnURL
- pp_TxnCurrency
- pp_TxnDateTime
- pp_TxnExpiryDateTime
- pp_TxnRefNo
- pp_TxnType (MWALLET)
- pp_Version (1.1)
- ppmpf_1 (mobile)
- pp_SecureHash

## Return URL Configured

- https://api.epost.pk/api/payments/jazzcash/callback

## Request to JazzCash Support

Please confirm for sandbox merchant MC771933:

1. Is direct Mobile Wallet REST DoTransaction enabled on this sandbox profile?
2. Is this merchant mapped to the correct channel/product/profile for one-time MWALLET API transactions?
3. Are the public sandbox success test numbers applicable to direct REST DoTransaction for this merchant, or only to hosted/testing subsets?
4. Should this merchant use a different API type/path (for example token/linking based flow) for one-time wallet transactions?

## Onboarding Requirement Compliance (Implemented App-Side)

As requested in onboarding email guidance from Muhammad Jawad Khan, the following are now implemented:

1. Status Inquiry API integration:
   - Provider endpoints wired for sandbox/live `PaymentInquiry/Inquire`
   - App routes:
     - `POST /api/payments/jazzcash/status-inquiry`
     - `POST /api/payments/jazzcash/status-inquiry/:txnRefNo`
2. IPN API strictness:
   - Unknown/missing transaction references are rejected.
3. Amount normalization:
   - `pp_Amount` is always sent as paisa (`PKR * 100`).
4. TxnRefNo format:
   - `EpoYYYYMMDDHHMMSS` for all new requests.
5. Secure hash per request/response:
   - Request hashes and response verification are active across callback, IPN, and status inquiry.

## Latest Live Evidence (Post-Implementation)

- Live create requests now return references in `Epo...` format, confirming rollout of TxnRef formatting change.
- Provider business response remains deterministic `199` for test numbers (`03123456789`, `03123456780`).
- Additional runtime issues discovered during post-deploy validation:
  - Status inquiry execution failed with `Failed to parse URL from undefined`.
  - Rapid third create request hit `invoiceNumber` unique constraint.
- Both issues were patched in follow-up commit `a4cc0ac` and redeployed; final confirmation run is pending latest Railway Api deployment success.

## Final Support Note

- The app now respects the support guidance to wait 10 minutes before inquiring pending or missing transactions.
- Failed `199` outcomes are still allowed to proceed to inquiry immediately for diagnostic purposes.
- Inquiry responses returned to the app are normalized as `completed`, `failed`, `pending`, `not_found`, or `error`.

## Security Notice

- Password and integrity salt are intentionally omitted from this packet.
