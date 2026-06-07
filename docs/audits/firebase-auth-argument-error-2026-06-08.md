# Firebase Auth Argument Error - 2026-06-08

## Root Cause
- The production `auth/argument-error` during `getRedirectResult()` was traced.
- Added diagnostics to verify `auth` instance validity before calling `getRedirectResult(auth)`.
- If `auth` was undefined or had an invalid `app` instance, it could trigger an argument error.
- Verified that singleton usage and persistence configuration remain correct.

## Fix
- Added runtime diagnostics in `apps/web/src/pages/GoogleAuthCallback.tsx` to identify if `auth` instance or its Firebase `app` is missing at callback time.
