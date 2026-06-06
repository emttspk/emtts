# Firebase Auth Audit 2026

## Scope
- Login and register Firebase auth frontend behavior
- Firebase config loading
- Railway production Web variables
- Mobile vs desktop auth handling

## Verified Configuration
- Firebase frontend config is sourced from `import.meta.env.VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`
- Production Railway Web service is online in `Epost` / `production`
- Frontend Firebase project target is `epost-auth`
- Production auth domain is documented as `epost-auth.firebaseapp.com`

## Observed Error
- Browser console reported:
  - `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?... 400`
  - `auth/no-auth-event`
  - `An internal error has occurred`

## Root Cause
- The login flow only fell back to the API backend for a narrow set of Firebase errors:
  - `user-not-found`
  - `invalid-credential`
  - `auth/invalid-login-credentials`
- Mobile/browser-specific Firebase failures such as `auth/no-auth-event`, `auth/network-request-failed`, and `auth/internal-error` were not treated as recoverable in the email/password login path.
- That caused a recoverable Firebase-side failure to surface to the user instead of allowing the working API-backed login path to complete.

## Affected Files
- `apps/web/src/lib/firebaseAuthGuards.ts`
- `apps/web/src/pages/Login.tsx`

## Production Impact
- Desktop users were less likely to hit the issue.
- Mobile users could see Firebase internal/auth-event errors during email/password login.
- The backend login path was already healthy, so the failure primarily blocked the frontend from using a valid fallback.

## Fix Applied
- Added a reusable fallback detector for recoverable Firebase login errors.
- Expanded the email/password login fallback to include:
  - `auth/no-auth-event`
  - `auth/network-request-failed`
  - `auth/internal-error`
- This preserves the Firebase-first flow while letting the API login complete when Firebase auth transport fails.

## Recommended Follow-Up
- Verify Google authorized domains in Firebase Console for:
  - `epost.pk`
  - `www.epost.pk`
- Confirm the Firebase auth provider settings for the production project `epost-auth`
- Re-test mobile email/password sign-in and confirm the API fallback completes cleanly
