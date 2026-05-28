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

## Deployment Evidence

- Git commit: `749aff1`
- Railway deployment: `4caf03a4-e20e-4932-b404-b746dac9b666` (`SUCCESS`)

## Security Notes

- Keep credentials in environment variables only.
- Do not commit merchant password or integrity salt in plaintext.
- In docs/reports, mask secrets (for example, `y7v***825`).
