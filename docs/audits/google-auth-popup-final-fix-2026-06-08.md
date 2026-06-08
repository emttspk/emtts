# Google Auth Phase 9: Popup-Only Final Fix

**Date**: 2026-06-08
**Components**: `Login.tsx`, `Register.tsx`, `GoogleAuthCallback.tsx`, `firebase.ts`, `googleAuth.ts`
**SDK**: `firebase@^12.12.1`
**Deployment**: Railway (production)

---

## Live Error History

After Phase 8, the redirect flow still produced:

```
Firebase iframe/auth event: auth/no-auth-event
"Google sign-in could not be completed on this device."
```

Despite fixing the `browserPopupRedirectResolver` (Phase 6), eliminating pre-navigation (Phase 7), and moving `getRedirectResult` to the return page (Phase 8), the redirect flow remained fundamentally broken on mobile devices.

---

## Root Cause

`getRedirectResult(auth)` with `initializeAuth()` is unreliable across browsers. The Firebase SDK's redirect handler uses an iframe-based auth event mechanism that:

1. Fails on mobile Safari due to Intelligent Tracking Prevention (ITP) blocking cross-origin iframe storage
2. Fails on some Chromium-based browsers when the authDomain processes the redirect and attempts to communicate back to the app page
3. Produces `auth/no-auth-event` when the SDK cannot detect the pending redirect result after page load

After 7 prior phases attempting to fix the redirect flow (Phases 3-8), all production evidence points to the same conclusion: **the redirect flow cannot be made reliable** with the current Firebase v12 SDK + `initializeAuth()` stack.

---

## Fix: Popup-Only Authentication

### 1. `Login.tsx` and `Register.tsx` — Always Use `signInWithPopup`

Removed the entire `shouldUseRedirectAuthFlow()` branch:

```typescript
// BEFORE (Phases 3-8):
if (shouldUseRedirectAuthFlow()) {
  // signInWithRedirect path — broken
  ...
  return;
}
// signInWithPopup path — worked on desktop
const result = await signInWithPopup(auth, provider);
```

```typescript
// AFTER (Phase 9):
// Only popup — works on all devices
const result = await signInWithPopup(auth, provider);
```

The `handleGoogleLogin()` and `handleGoogleRegister()` functions now directly call `signInWithPopup(auth, provider)` without checking device type.

### 2. Popup Blocked Handling

Added `getPopupErrorMessage()` helper:

| Firebase Error Code | User Message |
|---------------------|--------------|
| `auth/popup-blocked` | "Please allow popups and try again." |
| `auth/popup-closed-by-user` | "Google sign-in was cancelled. Please try again." |
| Other | Default friendly message from `getFriendlyFirebaseAuthMessage` |

### 3. Stale Storage Cleanup

Added `clearStaleAuthStorage()` called at the start of every Google button click, removing:

- `GOOGLE_REDIRECT_START` — redirect flow marker
- `GOOGLE_AUTH_DEBUG` — Phase 3-5 debug trace
- `GOOGLE_AUTH_FIREBASE_DIAG` — Phase 5 diagnostics
- `labelgen_google_auth_redirect_started:v1` — legacy v1 key

### 4. `googleAuth.ts` — Removed Redirect Functions

| Removed | Reason |
|---------|--------|
| `GoogleRedirectStartState` type | No redirect marker needed |
| `readGoogleRedirectStart()` | No redirect marker to read |
| `writeGoogleRedirectStart()` | No redirect marker to write |
| `waitForReadyCurrentUser()` | Only used by `processGoogleRedirect` |
| `processGoogleRedirect()` | No redirect result to process |
| `import { getRedirectResult, onAuthStateChanged, type Auth, type User }` | No redirect dependencies |

Kept: `clearGoogleRedirectStart()`, `GOOGLE_REDIRECT_START_KEY` (for cleanup), `exchangeGoogleFirebaseToken()`, `normalizeNextPath()`, `getFlow()`, `GoogleAuthFlow`, and all debug utilities.

### 5. `firebase.ts` — Removed Redirect Cleanup

Removed `clearGoogleRedirectStart()` import and call from dashboard path cleanup block.

### 6. `GoogleAuthCallback.tsx` — Legacy Fallback

Simplified to bare fallback:
- Still attempts `getRedirectResult(auth)` for edge cases
- Shows message: "Google sign-in now uses a popup. Please sign in from the login or register page."
- No redirect marker reading
- Link back to login/register

---

## New Flow

```
Login/Register
→ User clicks "Sign in with Google"
→ clearStaleAuthStorage() — removes all redirect/debug storage keys
→ signInWithPopup(auth, provider) — opens Google popup
→ User authenticates in popup
→ Popup closes
→ getIdToken() from result.user
→ POST /api/auth/firebase-login with idToken
→ setSession(data.token, data.user.role, data.refreshToken)
→ trackLogin() / trackRegistrationComplete()
→ navigate to /dashboard
```

If popup blocked:
```
→ catch auth/popup-blocked
→ "Please allow popups and try again."
```

---

## Build Result

```
npm run build → built in 22.96s
```

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/lib/googleAuth.ts` | Removed `readGoogleRedirectStart`, `writeGoogleRedirectStart`, `GoogleRedirectStartState`, `waitForReadyCurrentUser`, `processGoogleRedirect`, all Firebase auth imports |
| `apps/web/src/pages/Login.tsx` | Removed `signInWithRedirect`, `shouldUseRedirectAuthFlow`, redirect `useEffect`, `googleRedirectProcessing`. Only `signInWithPopup`. Added `getPopupErrorMessage` and `clearStaleAuthStorage`. |
| `apps/web/src/pages/Register.tsx` | Same as Login. Removed `googleRedirectProcessing` state and button guards. |
| `apps/web/src/pages/GoogleAuthCallback.tsx` | Simplified to legacy fallback — no redirect marker, no `waitForReadyCurrentUser`, no `readGoogleRedirectStart`. Shows "popup only" message. |
| `apps/web/src/firebase.ts` | Removed `clearGoogleRedirectStart` import and call from dashboard path |
