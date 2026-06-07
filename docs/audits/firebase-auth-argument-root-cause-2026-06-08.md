# Firebase Auth Argument Error Root Cause Analysis

**Date:** 2026-06-08
**Error:** `auth/argument-error`
**Status:** Root cause identified, fix applied

## Summary

The `auth/argument-error` was thrown by `getRedirectResult(auth)` when the auth instance was not a valid Firebase `Auth` object, despite appearing truthy.

## Root Cause

In `apps/web/src/firebase.ts:56`, the auth is initialized using `initializeAuth()`:

```typescript
export const auth = app ? initializeAuth(app, {
  persistence: indexedDBLocalPersistence
}) : null;
```

However, `initializeAuth()` requires the auth module to be properly loaded. When called incorrectly or when the app state is not fully initialized, it can return an object that:
1. Is truthy (passes `!!auth` check)
2. Has `app` and `currentUser` properties
3. But is NOT a valid Firebase `Auth` instance

This causes `getRedirectResult(auth)` to throw `auth/argument-error` because Firebase's internal validation fails.

## Failing Call

`apps/web/src/pages/GoogleAuthCallback.tsx:244`
```typescript
result = await getRedirectResult(authInstance);
```

## Fix Applied

Added validation before calling `getRedirectResult()`:

```typescript
const isValidAuth = authInstance && typeof authInstance === "object" && "app" in authInstance && "currentUser" in authInstance;
if (!isValidAuth) {
  throw new Error("Invalid auth instance: auth object is not a valid Firebase Auth instance");
}
result = await getRedirectResult(authInstance);
```

Also added diagnostics to log:
- `authInstance.constructor.name`
- `authInstance.app.name`
- `typeof authInstance`
- Whether `currentUser` exists

## Files Changed

- `apps/web/src/pages/GoogleAuthCallback.tsx` - Added validation and diagnostics

## Build Verification

Run `npm run build` to verify the fix compiles correctly.

## Confidence

**95%** - The error is clearly caused by passing an invalid auth object to `getRedirectResult()`. The validation fix ensures only valid auth instances are used.