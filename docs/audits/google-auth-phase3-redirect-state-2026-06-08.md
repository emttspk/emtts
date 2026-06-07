# Google Auth Phase 3 Redirect State Audit

Date: 2026-06-08

## Scope
- `apps/web/src/pages/GoogleAuthCallback.tsx`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Register.tsx`
- `apps/web/src/firebase.ts`

## Finding
- The Google auth flow was relying on a stale boolean redirect flag to decide whether a fresh redirect should start.
- Because that flag was not structured or refreshed per attempt, a prior failed run could leave the callback thinking redirect was already in progress when a new user-initiated attempt had not actually started yet.
- That made `getRedirectResult()` come back `null` and left the callback with no user/session to restore.

## Fix
- Seed a fresh `GOOGLE_REDIRECT_START` marker from the Google login/register entry points.
- Upgrade that marker to `redirect-started` immediately before `signInWithRedirect()`.
- Log the marker metadata in the callback, including `timestamp`, `flow`, `origin`, `authDomain`, current URL, and auth app name.
- Clear the marker after the dashboard loads successfully so stale redirect state cannot block the next attempt.

## Validation
- `npm run build` PASS

