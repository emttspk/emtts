# Auth Mobile Google Audit - 2026-06-07

## Scope
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Register.tsx`
- `apps/web/src/pages/GoogleAuthCallback.tsx`
- `apps/web/src/lib/googleAuth.ts`
- `apps/web/src/lib/firebaseAuthGuards.ts`
- `apps/api/src/routes/auth.ts`

Protected areas not touched:
- label generation
- money order generation
- tracking
- complaints
- billing
- admin
- worker
- storage
- R2
- Redis
- PDF logic

## Root Cause
- Google auth on mobile was relying on page-local redirect handling with no dedicated callback route.
- The login page also contained duplicate Firebase imports, which increased fragility in the auth bundle.
- Register and login flows mixed popup and redirect behaviors directly in the pages, which made mobile recovery harder to reason about.

## Fix
- Added a dedicated Google auth callback route at `/auth/callback`.
- Mobile/touch devices now navigate to the callback route, which initiates and completes `signInWithRedirect`.
- Desktop continues using `signInWithPopup`.
- Google sign-in success now exchanges the Firebase ID token with `/api/auth/firebase-login`, stores the session, and redirects to `/dashboard`.
- Errors now surface through friendly user-facing messages instead of silent redirect failures.
- Loading state is cleared on failure paths.

## Validation
- `npm.cmd run build` passed.
- `npm.cmd run auth:hammer` passed.

## Production Checks
- Confirm Firebase authorized domains include `www.epost.pk` and `epost.pk`.
- Confirm Firebase Auth provider settings for the production project are still enabled.
- Confirm the production frontend env vars for Firebase and API routing are present in the deployment environment.

