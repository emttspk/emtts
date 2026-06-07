# Google Registration Final Root Cause - 2026-06-08

## Scope

- Google sign-up and login flow only.
- Files in scope:
  - `apps/web/src/pages/GoogleAuthCallback.tsx`
  - `apps/web/src/lib/googleAuth.ts`
  - `apps/api/src/routes/auth.ts`

## What Was Verified

- The Google callback now handles `auth/argument-error` on `getRedirectResult(auth)` and can continue to the `auth.currentUser` fallback.
- The callback logs:
  - current user UID/email
  - token generation
  - exchange start/response
  - session save
  - redirect attempt
  - non-fatal analytics errors
- The `/api/auth/firebase-login` endpoint now logs:
  - request start
  - decoded provider/email/UID
  - user lookup result
  - user creation
  - session construction
  - success/failure details
- The Google token exchange helper now logs request/response status and response body.

## Root Cause

- The register flow contained a post-exchange side effect that could still abort the callback after a successful Firebase token exchange.
- In practice, that meant a successful Google auth could still end up as the generic browser message `Google registration failed`.
- The register-only branch was the only one performing the `trackRegistrationComplete("google")` side effect, so it was the narrowest plausible failure surface after token exchange and session creation succeeded.
- The fix now treats telemetry failures as non-fatal so they cannot block `setSession()` or the dashboard redirect.

## Minimal Fix

- Wrapped the register/login analytics call in `GoogleAuthCallback.tsx` with a local `try/catch`.
- Preserved the existing auth/session flow.
- Kept the backend diagnostics limited to the `firebase-login` path.

## Validation

- `npm run build`: PASS
- Live Google signup/login browser verification still needs a fresh production attempt after deployment so the new logs can capture the exact response code/body in the real browser flow.

