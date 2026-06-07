# Google Mobile Root Cause Analysis - 2026-06-08

## Root Cause
The `getRedirectResult()` method was returning `null` because Firebase Auth was using default (in-memory) persistence, which failed to persist the authentication state across the redirect loop on mobile browsers.

## Fix
Updated `apps/web/src/firebase.ts` to use `initializeAuth` with `indexedDBLocalPersistence`. This ensures that the authentication state is reliably stored and retrieved across browser redirects, even on mobile devices.
