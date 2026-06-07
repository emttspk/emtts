# Google Auth Pre-Backend Trace - 2026-06-08

## Scope

- Frontend callback trace only.
- Files in scope:
  - `apps/web/src/pages/GoogleAuthCallback.tsx`
  - `apps/web/src/firebase.ts`
  - `apps/web/src/lib/googleAuth.ts`

## Added Diagnostics

- Callback entry
- `getRedirectResult()` start
- `getRedirectResult()` result
- `auth.currentUser` exists?
- `auth.currentUser.uid`
- `auth.currentUser.email`
- `getIdToken()` start
- `getIdToken()` success
- `firebase-login` request start
- Browser-visible `window.__GOOGLE_AUTH_DEBUG__` with:
  - `step`
  - `uid`
  - `email`
  - `error`

## Intended Use

- Run one real Google registration attempt in production.
- Inspect browser console and `window.__GOOGLE_AUTH_DEBUG__` to identify the exact step where execution stops before the backend request.

## Current Trace Status

- Last confirmed successful step from the current code path: callback entry and redirect-result handling are reached.
- First failing step will be determined by the next live browser attempt because the backend was not reached before this trace was added.

## Validation

- `npm run build`: PASS

