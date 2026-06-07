# Google Auth Final Simplification

**Date**: 2026-06-08
**Components**: `Login.tsx`, `Register.tsx`, `GoogleAuthCallback.tsx`, `firebase.ts`, `googleAuth.ts`
**SDK**: `firebase@^12.12.1`
**Deployment**: Railway (production)

---

## Problem

The two-step Google auth flow was fragile:

```
Login/Register → navigate /auth/callback → signInWithRedirect → Google → Firebase handler → /auth/callback
```

The pre-navigation to `/auth/callback` before calling `signInWithRedirect` introduced a race condition where Firebase redirect state could be lost during the client-side navigation. This produced the error: **"Google sign-in could not be completed on this device."**

Phase 6 fixed the `browserPopupRedirectResolver` configuration, but the two-step navigation remained as a secondary failure vector.

---

## Root Cause

The `nav(buildGoogleAuthCallbackPath("login"))` call in `handleGoogleLogin` (and equivalent in `handleGoogleRegister`) performed a client-side React Router navigation to `/auth/callback` **before** `signInWithRedirect` was called. This meant:

1. Login/Register navigated away to `/auth/callback`
2. `GoogleAuthCallback` mounted and then called `signInWithRedirect`
3. If the Firebase redirect state was not properly carried across the SPA navigation, `getRedirectResult` would return `null` on return

The fix eliminates step 1 entirely. `signInWithRedirect` is called directly from Login/Register, which is the page Firebase will redirect back to after Google auth.

---

## New Flow

```
Login/Register
→ set session marker
→ call signInWithRedirect(auth, provider) directly
→ Google
→ Firebase handler
→ back to Login/Register (full page reload)
→ redirect-detection useEffect fires
→ navigate to /auth/callback
→ getRedirectResult
→ firebase-login API
→ set session
→ redirect to dashboard
```

---

## Changes

### `apps/web/src/lib/googleAuth.ts`

**Added** — marker utility functions for shared access:

| Export | Purpose |
|--------|---------|
| `GoogleRedirectStartState` | Type for redirect marker shape |
| `GOOGLE_REDIRECT_START_KEY` | sessionStorage key constant |
| `readGoogleRedirectStart()` | Read marker from sessionStorage |
| `writeGoogleRedirectStart(flow, stage)` | Write marker to sessionStorage |
| `clearGoogleRedirectStart()` | Remove marker from sessionStorage |
| `getFlow(value)` | Parse flow query param (login/register) |

These were previously private to `GoogleAuthCallback.tsx`. Moved here so `Login.tsx` and `Register.tsx` can read/write the marker without importing from the callback page.

### `apps/web/src/pages/Login.tsx`

**Removed**:
- `import { buildGoogleAuthCallbackPath } from "../lib/googleAuth"` (no longer needed)
- `GOOGLE_REDIRECT_START_KEY` constant (now imported from googleAuth.ts)
- `nav(buildGoogleAuthCallbackPath("login"), { replace: true })` pre-navigation in `handleGoogleLogin`
- Raw `sessionStorage.setItem()` for marker (now uses `writeGoogleRedirectStart()`)

**Added**:
- `import { signInWithRedirect } from "firebase/auth"`
- `import { clearGoogleAuthDebugStorage, clearGoogleRedirectStart, readGoogleRedirectStart, writeGoogleRedirectStart } from "../lib/googleAuth"`
- `useEffect` import from React (was already imported but now used for redirect detection)
- `clearGoogleAuthDebugStorage()` and `clearGoogleRedirectStart()` calls before each redirect attempt
- Redirect-detection `useEffect` on mount: reads `GOOGLE_REDIRECT_START` marker, if present with `flow: "login"`, forwards to `/auth/callback?flow=login&next=%2Fdashboard`

**Updated**:
- `handleGoogleLogin` redirect path now calls `signInWithRedirect(auth, provider)` directly after setting marker

### `apps/web/src/pages/Register.tsx`

Same changes as Login.tsx but for the register flow:

- Removed pre-navigation `nav("/auth/callback?flow=register...")` 
- Removed `GOOGLE_REDIRECT_START_KEY` constant
- Removed raw `sessionStorage.setItem()` for marker
- Added same imports as Login.tsx
- Added redirect-detection `useEffect` for `flow: "register"`

### `apps/web/src/pages/GoogleAuthCallback.tsx`

**Removed** (significant simplification):

| Removed | Lines saved |
|---------|-------------|
| `GoogleRedirectStartState` type | ~7 |
| `getFlow()` | ~3 |
| `describeCurrentUser()` | ~25 |
| `captureFirebaseDiagnostics()` | ~40 |
| `readGoogleRedirectStart()` | ~10 |
| `writeGoogleRedirectStart()` | ~15 |
| `clearGoogleRedirectStart()` | ~10 |
| `startRedirect()` function | ~25 |
| Recovery UI buttons (Retry, Continue, Back) | ~35 |
| Phase 5 diagnostics logging | ~30 |
| Redundant console.info debug logs | ~40 |
| Large auth-shell info card with recovery text | ~15 |
| Total removed | ~255 |

**Kept**:
- `getRedirectResult` processing
- `waitForReadyCurrentUser` fallback
- Session completion (firebase-login → setSession → redirect)
- Error display on final failure
- Simple loading status text

**Updated**:
- Import marker functions from `googleAuth.ts` instead of local definitions
- Simplified `useEffect` to only handle return from Google (no redirect initiation)
- Simplified render to show loading text only; on error, a single "Back to login/register" link

### `apps/web/src/firebase.ts`

**Removed**:
- `indexedDBLocalPersistence` import (unused since Phase 6)
- `getAuth` import (unused)
- `GOOGLE_AUTH_FIREBASE_DIAG_KEY` constant and 20-line diagnostics block (Phase 5 noise)
- `GOOGLE_REDIRECT_START_KEY` constant (now imported from googleAuth.ts)
- Raw `window.sessionStorage.removeItem(GOOGLE_REDIRECT_START_KEY)` — replaced with `clearGoogleRedirectStart()`

**Added**:
- Import `clearGoogleRedirectStart`, `GOOGLE_REDIRECT_START_KEY` from googleAuth.ts

---

## Build Result

```
npm run build → ✅ built in 15.43s
```

---

## New Flow Summary

1. User clicks "Sign in with Google" on Login or Register page
2. Page sets `GOOGLE_REDIRECT_START` marker in sessionStorage (`flow: "login"` or `"register"`, `stage: "entry"`)
3. Page calls `signInWithRedirect(auth, provider)` directly — browser navigates to Google
4. User authenticates on Google
5. Google redirects to Firebase Auth handler on `authDomain`
6. Firebase processes OAuth and redirects back to origin page (Login or Register) — full page reload
7. Login/Register component mounts, `useEffect` detects `GOOGLE_REDIRECT_START` marker
8. Component navigates to `/auth/callback?flow=...&next=...` (client-side navigation, marker cleared)
9. `GoogleAuthCallback` calls `getRedirectResult(auth)` → gets the authenticated user
10. Calls `/api/auth/firebase-login` with Firebase ID token → receives app JWT
11. Calls `setSession()` with app token → saves to localStorage
12. Redirects to `/dashboard`

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/lib/googleAuth.ts` | Added `GOOGLE_REDIRECT_START_KEY`, `GoogleRedirectStartState`, `readGoogleRedirectStart()`, `writeGoogleRedirectStart()`, `clearGoogleRedirectStart()`, `getFlow()` |
| `apps/web/src/pages/Login.tsx` | Removed pre-navigation to `/auth/callback`; calls `signInWithRedirect` directly; added redirect-detection `useEffect` |
| `apps/web/src/pages/Register.tsx` | Removed pre-navigation to `/auth/callback`; calls `signInWithRedirect` directly; added redirect-detection `useEffect` |
| `apps/web/src/pages/GoogleAuthCallback.tsx` | Simplified ~255 lines removed; only handles `getRedirectResult` return; no `startRedirect()`; no recovery UI |
| `apps/web/src/firebase.ts` | Removed Phase 5 diagnostics block (`GOOGLE_AUTH_FIREBASE_DIAG_KEY`), unused imports, uses `clearGoogleRedirectStart()` |
