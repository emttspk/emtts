# Google Auth Phase 8: No-Auth-Event Fix

**Date**: 2026-06-08
**Components**: `Login.tsx`, `Register.tsx`, `googleAuth.ts`
**SDK**: `firebase@^12.12.1`
**Deployment**: Railway (production)

---

## Live Error

After Phase 7 simplification, the Google redirect flow produced:

```
Firebase iframe/auth event:
auth/no-auth-event
message: An internal error has occurred.
```

The Google account chooser opened and consent worked, but after returning to the app:

```
"Google sign-in could not be completed on this device."
```

---

## Root Cause

Phase 7 added a redirect-detection `useEffect` on Login/Register that **forwarded** returning users to `/auth/callback` via React Router navigation:

```typescript
// Phase 7 (BROKEN)
useEffect(() => {
  const marker = readGoogleRedirectStart();
  if (marker && marker.flow === "login") {
    clearGoogleRedirectStart();
    nav("/auth/callback?flow=login&next=%2Fdashboard", { replace: true });
  }
}, [nav]);
```

Firebase's `getRedirectResult(auth)` must be called on the **same page** that Firebase returns to after the OAuth redirect. The SPA navigation from Login/Register to `/auth/callback` consumed or invalidated the pending redirect auth event before `getRedirectResult` could retrieve it.

The Firebase SDK internally processes the redirect result during page initialization. A subsequent React Router navigation creates a new rendering context where the auth event is no longer pending, causing `getRedirectResult` to return `null`.

---

## Fix

### 1. `googleAuth.ts` — Shared Redirect Processing

Added `waitForReadyCurrentUser(auth, maxWaitMs)` and `processGoogleRedirect(auth)` as exported helpers:

```typescript
export async function processGoogleRedirect(authInstance: Auth): Promise<{ user: User; idToken: string } | null> {
  let result = null;
  try {
    result = await getRedirectResult(authInstance);
  } catch {
    // Fall through
  }
  if (result) {
    const idToken = await result.user.getIdToken();
    return { user: result.user, idToken };
  }
  const currentUser = await waitForReadyCurrentUser(authInstance);
  if (currentUser) {
    const idToken = await currentUser.getIdToken(true);
    return { user: currentUser, idToken };
  }
  return null;
}
```

Key design: takes `authInstance` as a parameter to avoid circular dependency (firebase.ts imports from googleAuth.ts).

### 2. `Login.tsx` — Direct Processing

Replaced the forwarding `useEffect`:

```typescript
// Phase 8 (FIXED)
useEffect(() => {
  const marker = readGoogleRedirectStart();
  if (!marker || marker.flow !== "login") return;

  let cancelled = false;
  void (async () => {
    setGoogleRedirectProcessing(true);
    try {
      const result = await processGoogleRedirect(auth!);
      if (cancelled) return;
      if (result) {
        await loginWithFirebaseToken(result.idToken);
        clearGoogleRedirectStart();
        clearGoogleAuthDebugStorage();
      } else {
        setErr("Google sign-in could not be completed. Please try again.");
        clearGoogleRedirectStart();
      }
    } catch (error) {
      setErr(getFriendlyFirebaseAuthMessage(error, "Google login failed"));
      clearGoogleRedirectStart();
    } finally {
      if (!cancelled) setGoogleRedirectProcessing(false);
    }
  })();
  return () => { cancelled = true; };
}, []);
```

- **No navigation** to another route before `getRedirectResult`
- Calls `processGoogleRedirect(auth)` directly from Login page
- On success: `loginWithFirebaseToken` → `setSession` → navigate to dashboard
- On failure: shows error on the same Login page
- Adds `googleRedirectProcessing` state for loading overlay

### 3. `Register.tsx` — Direct Processing

Same pattern but calls the `firebase-login` API directly and uses `finalizeRegistrationSession`:

- Added `googleRedirectProcessing` state
- Direct `processGoogleRedirect(auth)` call
- On success: `api("/api/auth/firebase-login")` → `clearGoogleRedirectStart()` → `finalizeRegistrationSession`
- On failure: error on same page, clear marker
- Button states updated to reflect `googleRedirectProcessing`

### 4. Cleanup

- Removed dead `buildGoogleAuthCallbackPath()` from `googleAuth.ts` (no longer imported anywhere)
- `GoogleAuthCallback.tsx` retained as-is (it's already a clean fallback route after Phase 7)

---

## New Flow

```
Login/Register
→ set session marker (GOOGLE_REDIRECT_START)
→ clear stale markers
→ call signInWithRedirect(auth, provider) directly
→ browser navigates to Google
→ user authenticates
→ Firebase handler on authDomain processes OAuth
→ browser returns to Login/Register (full page reload)
→ component mounts
→ useEffect reads GOOGLE_REDIRECT_START marker
→ calls processGoogleRedirect(auth) ON THE SAME PAGE
→ getRedirectResult(auth) succeeds (same page, auth event intact)
→ getIdToken() → firebase-login API → setSession()
→ clear marker → navigate to /dashboard
```

If `getRedirectResult` returns null:
→ waitForReadyCurrentUser fallback
→ if found, same token exchange + session flow
→ if not found, show error message on same page

---

## Build Result

```
npm run build → built in 13.21s
```

---

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/lib/googleAuth.ts` | Added `waitForReadyCurrentUser()`, `processGoogleRedirect()`. Removed `buildGoogleAuthCallbackPath()`. |
| `apps/web/src/pages/Login.tsx` | Replaced forwarding `useEffect` with direct `processGoogleRedirect()` call. Added `googleRedirectProcessing` state. |
| `apps/web/src/pages/Register.tsx` | Same as Login. Added `googleRedirectProcessing` to button disabled states. |
| `apps/web/src/pages/GoogleAuthCallback.tsx` | No changes (already clean fallback from Phase 7). |
| `apps/web/src/firebase.ts` | No changes. |
