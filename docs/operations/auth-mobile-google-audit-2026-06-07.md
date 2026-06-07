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
- The callback path initially depended too heavily on `getRedirectResult()` and did not recover when the redirect completed but Firebase returned `null` while `auth.currentUser` was already available.
- Browser storage access was not fully guarded, so a mobile browser with restricted storage could lose the session handoff even after Firebase sign-in succeeded.
- The login page also contained duplicate Firebase imports, which increased fragility in the auth bundle.
- Register and login flows mixed popup and redirect behaviors directly in the pages, which made mobile recovery harder to reason about.

## Fix
- Added a dedicated Google auth callback route at `/auth/callback`.
- Mobile/touch devices now navigate to the callback route, which initiates and completes `signInWithRedirect`.
- The callback page now:
  - Uses `getRedirectResult()` first.
  - Falls back to `auth.currentUser.getIdToken(true)` when the redirect result is null but Firebase still has the signed-in user.
  - Saves the session with a browser-storage-safe helper that falls back to in-memory storage if needed.
  - Redirects to the dashboard immediately after session save.
  - Shows retry and continue controls instead of looping endlessly.
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
