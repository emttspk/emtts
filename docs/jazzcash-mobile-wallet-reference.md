# JazzCash Mobile Wallet Reference

## Scope

This reference documents the current Mobile Wallet API integration behavior used by the API service and the validated secure-hash rules from sandbox testing.

## Endpoint

- Sandbox: `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
- Live: `https://payments.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`

## Hash Rules (Validated)

- Hash algorithm: `HMAC-SHA256`
- HMAC key: `JAZZCASH_INTEGRITY_SALT`
- Hash input:
  - Take all outbound fields whose key starts with `pp` (excluding `pp_SecureHash`)
  - Exclude empty values
  - Sort keys in ascending ASCII order
  - Join values with `&`
  - Prepend integrity salt value followed by `&`
- Digest output: uppercase hex

## Request Field Set (Current)

Required operational set for current sandbox validation:

- `pp_Amount`
- `pp_BillReference`
- `pp_Description`
- `pp_Language`
- `pp_MerchantID`
- `pp_Password`
- `pp_ReturnURL`
- `pp_TxnCurrency`
- `pp_TxnDateTime`
- `pp_TxnExpiryDateTime`
- `pp_TxnRefNo`
- `pp_TxnType` (`MWALLET`)
- `pp_Version` (`1.1`)
- `ppmpf_1` (mobile wallet number)
- `ppmpf_2..5` (blank)
- `pp_SecureHash`

## Excluded Fields (Hash Mismatch Source)

These fields were removed from the Mobile Wallet request builder for this flow:

- `pp_BankID`
- `pp_ProductID`
- `pp_CNIC`

Including these caused provider `110` (`Please provide valid value for pp_SecureHash`) in our live authenticated tests before the fix.

## Latest Live Test Outcome (2026-05-29)

Post-fix authenticated matrix against deployed API:

- `03123456789` -> provider code `199`
- `03123456780` -> provider code `199`
- `03123456781` -> provider code `199`

All three requests now pass hash validation (no provider `110`). Current failure mode is provider business response `199` (`Sorry! Your transaction was not successful. Please try again later.`), indicating a sandbox profile/wallet-state issue rather than hash construction.

## Provider 199 Investigation Summary (2026-05-29)

### External References Checked

- Official:
  - `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/ApiReferences.html`
  - `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/index.html`
  - `https://sandbox.jazzcash.com.pk/SandboxDocumentation/v4.2/Resources.html`
- Community:
  - `https://github.com/shehryar96/Jazzcash-mobile-wallet-Integration` (token/recurring flow)
  - `https://github.com/zfhassaan/jazzcash` (hosted checkout only)
  - `https://packagist.org/packages/aticmatic/laravel-jazzcash` (direct MWallet v2 package notes)

### Direct Provider Diagnostics (Sandbox)

Using temporary scripts (not committed), direct calls were sent to JazzCash sandbox with masked credentials:

- `scripts/tmp-jazzcash-provider-199-diag.mjs`
- `scripts/tmp-jazzcash-provider-199-amount-sweep.mjs`

Key observed outcomes:

- Payloads with `pp_Version=1.1`, `pp_TxnType=MWALLET`, `pp_ReturnURL` and valid hash consistently pass hash validation and return `199`.
- Removing `pp_ReturnURL` returns `110` (invalid return URL).
- Omitting `pp_Version` returns `110` (invalid version).
- Adding `pp_CNIC` to the currently accepted flow causes hash rejection (`110` invalid `pp_SecureHash`).
- v4 token endpoint variant correctly rejects missing token with `110` invalid payment token.

### Amount/Number Sweep Result

With hash-valid payload shape:

- Numbers: `03123456789`, `03123456780`, `03123456781`
- Amounts: `100`, `200`, `500`, `1000`, `10000`, `99900`

All combinations returned provider code `199`.

### Conclusion

- Hash construction is valid for the active merchant flow (code `110` resolved).
- Provider code `199` aligns with official `Resources` mapping (`System error`).
- Remaining blocker is vendor-side sandbox merchant/profile enablement for direct Mobile Wallet API on `DoTransaction`.

### Support Escalation Data Points

- Merchant: `MC771933`
- Endpoint: `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
- Return URL in use: `https://api.epost.pk/api/payments/jazzcash/callback`
- Symptom: all hash-valid transactions return `199` across numbers and amounts
- Ask JazzCash to verify direct Mobile Wallet REST API enablement/profile mapping for this merchant.

## Deployment Evidence

- Git commit: `749aff1`
- Railway deployment: `4caf03a4-e20e-4932-b404-b746dac9b666` (`SUCCESS`)

## Security Notes

- Keep credentials in environment variables only.
- Do not commit merchant password or integrity salt in plaintext.
- In docs/reports, mask secrets (for example, `y7v***825`).

## Final Revalidation (2026-05-29)

### Cleanup Status

- Temporary JazzCash diagnostic scripts and loose log artifacts were cleaned from the workspace.
- Official documentation assets under `jazz cash/` were explicitly preserved.

### Environment and Health Baseline

- API health endpoint returned `200`.
- Railway Api service online; latest active successful deployment remained `4caf03a4` with newer docs-only pipeline entries marked `SKIPPED`.
- Production env still points Mobile Wallet to `DoTransaction` sandbox/live endpoints with `JAZZCASH_ENV=sandbox`.

### Sandbox API Testing Page Correlation

- JazzCash sandbox API Testing page was reported by user as:
  - `pp_ResponseCode=199`
  - `Sorry! Your transaction was not successful. Please try again later.`
- This is strong independent evidence that request shape can be accepted while transaction is rejected at provider/business layer.

### Direct Terminal Reproduction (Hash-Valid)

- Endpoint: `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/Payment/DoTransaction`
- Core request fields used:
  - `pp_Amount`, `pp_BillReference`, `pp_Description`, `pp_Language`, `pp_MerchantID`, `pp_Password`, `pp_ReturnURL`, `pp_TxnCurrency`, `pp_TxnDateTime`, `pp_TxnExpiryDateTime`, `pp_TxnRefNo`, `pp_TxnType`, `pp_Version`, `ppmpf_1`, `pp_SecureHash`
- Result:
  - HTTP `200`
  - `pp_ResponseCode=199`
  - `pp_ResponseMessage=Sorry! Your transaction was not successful. Please try again later.`
  - `pp_RetreivalReferenceNo` present
  - Hash accepted (no `110`)

### Focused Provider 12-Variant Matrix

- Hash-valid variants across request encoding/optional field shapes returned `199`.
- Amounts tested: `500`, `1000`, `250000` -> all `199`.
- Mobiles tested: `03123456789`, `03123456780`, `03123456781` -> all `199`.
- CNIC variant result:
  - Adding `pp_CNIC=345678` to the current accepted v1.1 one-time payload produced `110` hash error for this merchant/path.

### Interpretation Against Sources

- Official `Resources` page maps `199` to `System error`.
- `shehryar96/Jazzcash-mobile-wallet-Integration` aligns to token/recurring flow (`domwallettransactionviatoken`) and should not be blindly applied to one-time `DoTransaction`.
- `zfhassaan/jazzcash` is hosted checkout-focused and non-applicable for direct REST Mobile Wallet API behavior.
- `aticmatic/laravel-jazzcash` is useful for v2.0 ideas and hash/callback structure but remains non-authoritative compared to official docs and actual merchant profile behavior.

### Final Diagnosis

- Current app-side secure hash and request shape are valid for the active one-time flow.
- Deterministic `199` from:
  - backend live requests,
  - direct terminal requests, and
  - JazzCash sandbox API Testing page,
  indicates a sandbox merchant/profile/channel enablement issue on provider side, not unresolved app signing bug.

### Required Provider Confirmation

- Ask JazzCash support to confirm for merchant `MC771933` sandbox profile:
  - direct Mobile Wallet REST `DoTransaction` is enabled,
  - allowed transaction type/profile/channel mapping for this merchant,
  - whether sandbox success numbers apply to direct REST flow or only hosted/testing subsets,
  - whether this merchant should use a different API type/path for one-time wallet transactions.

## Onboarding Email Compliance Update (2026-05-29)

Per onboarding requirements shared by Muhammad Jawad Khan, the backend now includes:

- Status Inquiry API integration
  - sandbox endpoint: `https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire`
  - live endpoint: `https://payments.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire`
  - app routes:
    - `POST /api/payments/jazzcash/status-inquiry`
    - `POST /api/payments/jazzcash/status-inquiry/:txnRefNo`
- Mandatory `TxnRefNo` pattern updated to:
  - `EpoYYYYMMDDHHMMSS`
- IPN mandatory handling tightened:
  - Unknown/missing txn reference is now rejected.
- Amount normalization preserved:
  - `pp_Amount` remains paisa (`PKR * 100`).
- Hash requirements preserved/expanded:
  - Unique request hash per request.
  - Response hash verification for callback/IPN and status inquiry responses.

### Live Runtime Observation After First Deploy

- New transaction references were confirmed live in `Epo...` format.
- Mobile wallet create continued returning provider code `199` for sandbox numbers.
- Two runtime defects were discovered and fixed in follow-up commit `a4cc0ac`:
  - Status inquiry used a misread optional env value (`undefined`) causing URL parse failure.
  - Invoice number truncation (`INV-${txnRefNo}` sliced to 20 chars) caused uniqueness collisions under rapid creates.

### Hotfix Status

- Hotfix commit: `a4cc0ac`
- Fixes included:
  - Safe endpoint fallback for optional status inquiry env values.
  - Invoice number set to full `txnRefNo` to preserve uniqueness.
- Final post-hotfix live matrix rerun remains pending until Railway marks the latest Api deployment `SUCCESS`.
