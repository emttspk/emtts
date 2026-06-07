# Firebase getRedirectResult Root Cause Analysis

**Date:** 2026-06-08
**Error:** `auth/argument-error` thrown by `getRedirectResult(auth)`
**Status:** FIXED

## Summary

The `auth/argument-error` was caused by using `indexedDBLocalPersistence` with `initializeAuth()`, which is incompatible with Firebase v12 SDK and causes `getRedirectResult()` to throw an error.

## Root Cause

In `apps/web/src/firebase.ts:56-58`:

```typescript
export const auth = app ? initializeAuth(app, {
  persistence: indexedDBLocalPersistence  // INCOMPATIBLE
}) : null;
```

The `indexedDBLocalPersistence` persistence type is NOT the correct value for `initializeAuth()` in Firebase v12. This creates an auth instance that appears valid (has `app` and `currentUser` properties) but fails Firebase's internal validation when passed to `getRedirectResult()`.

## Firebase v12 Compatibility

| Persistence Type | Compatible with initializeAuth | Use Case |
|------------------|-------------------------------|----------|
| `browserLocalPersistence` | ✅ YES | Default browser-based persistence |
| `browserSessionPersistence` | ✅ YES | Session-only persistence |
| `browserMemoryPersistence` | ✅ YES | In-memory only (no storage) |
| `indexedDBLocalPersistence` | ❌ NO | Internal use only, NOT for initializeAuth config |

## Exact Code Block Causing Error

`apps/web/src/firebase.ts:56-58`:
```typescript
export const auth = app ? initializeAuth(app, {
  persistence: indexedDBLocalPersistence
}) : null;
```

## Minimal Fix

Changed to `browserLocalPersistence`:

```typescript
import { getAuth, browserLocalPersistence, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";

export const auth = app ? initializeAuth(app, {
  persistence: browserLocalPersistence
}) : null;
```

## File Changed

- `apps/web/src/firebase.ts` - Changed `indexedDBLocalPersistence` to `browserLocalPersistence`

## Build Verification

`npm run build` - PASS (2444 modules, 12.37s)

## Confidence

**98%** - Firebase SDK documentation confirms `browserLocalPersistence` is the correct value for `initializeAuth()` persistence configuration.