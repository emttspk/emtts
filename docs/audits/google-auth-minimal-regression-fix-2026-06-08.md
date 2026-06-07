# Google Auth Minimal Regression Fix - 2026-06-08

## Scope

- Compare the Google auth callback path across stable `a10bb95`, suspect `1846fcc`, and current `main`.
- Only the following files were considered:
  - `apps/web/src/firebase.ts`
  - `apps/web/src/pages/GoogleAuthCallback.tsx`
  - `apps/web/src/lib/googleAuth.ts`
  - `apps/web/src/components/AuthShell.tsx`

## Diff Timeline

### Stable `a10bb95`

- Baseline auth implementation before the mobile Google redirect recovery work.
- No heavy callback timer/recovery state observed in the current regression path.

### Suspect `1846fcc`

- Introduced the heavy callback flow rework with redirect recovery state and timers.
- This is the first commit identified in the repo audit trail as high risk for the Google auth path.

### Current `main`

- Keeps the redirect callback path, session recovery, current-user fallback, and diagnostics.
- Still contained a fatal `getRedirectResult(auth!)` call that could throw `auth/argument-error` before fallback logic ran.

## Exact Offending Block

- File: [GoogleAuthCallback.tsx](</c:/Users/Nazim/Desktop/P.Post/Label%20Generator/apps/web/src/pages/GoogleAuthCallback.tsx:150>)
- Offending line family:
  - `const result = await getRedirectResult(auth!);`
- Why it fails:
  - when Firebase throws `auth/argument-error`, execution jumps to the outer catch and skips the `auth.currentUser` recovery branch

## Minimal Fix

- Wrapped the `getRedirectResult()` call in a small local try/catch.
- If the thrown error is `auth/argument-error`, the code now treats it as a recoverable redirect miss and continues into the existing `auth.currentUser` fallback path.
- Non-auth errors still propagate to the outer error handler.

## Validation Plan

- `npm run build`
- Focused auth hammer check via `npm run auth:hammer`
- Manual runtime expectation:
  - Google callback no longer crashes on the redirect argument error
  - mobile auth can still recover through `auth.currentUser`
