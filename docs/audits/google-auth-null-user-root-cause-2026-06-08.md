# Google Auth Null User Root Cause - 2026-06-08

## Scope

- File:
  - `apps/web/src/pages/GoogleAuthCallback.tsx`

## Observed Trace

- `step: "currentUser detected"`
- `uid: null`
- `email: null`
- `error: null`

## Root Cause

- The callback was entering the fallback branch before Firebase had fully hydrated the signed-in user.
- The object referenced by `auth.currentUser` was present enough to make the branch truthy, but its identity fields were not yet populated.
- That meant the code was reading a stale/partially hydrated auth object, not a fully ready Firebase user.

## Exact Failing Line

- `const currentUser = auth.currentUser;`
- The failure was not a thrown exception on this line.
- The real bug was that the code trusted `auth.currentUser` immediately instead of waiting for Firebase auth state to settle.

## Fix

- Added a small readiness helper that waits for Firebase to emit a real user before using the fallback path.
- Added diagnostics for:
  - `typeof currentUser`
  - `Object.keys(currentUser)`
  - constructor name
  - `providerData`
- Once a ready user is observed, the code continues to `getIdToken()` and then `firebase-login`.

## Validation

- `npm run build`: PASS

