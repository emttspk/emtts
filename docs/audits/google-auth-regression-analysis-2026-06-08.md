# Google Auth Regression Analysis - 2026-06-08

## Analysis Summary
- The `auth/argument-error` in production is triggered by `getRedirectResult(auth)`.
- Commit `2450fd0` (Jun 7) introduced the initial callback flow using `signInWithRedirect` and `getRedirectResult`.
- Commit `1846fcc` (Jun 7) reworked this flow significantly, introducing the current state management.
- The `auth` object is exported as a singleton from `apps/web/src/firebase.ts`.
- The `auth/argument-error` in Firebase `getRedirectResult` generally indicates that the `Auth` instance passed to it is either invalid, undefined, or associated with a different Firebase App instance than the one that initiated the redirect.

## Timeline
| Commit | Date | File | Change | Risk |
| :--- | :--- | :--- | :--- | :--- |
| `2450fd0` | 2026-06-07 | `GoogleAuthCallback.tsx` | Initial mobile callback implementation | High |
| `1846fcc` | 2026-06-07 | `GoogleAuthCallback.tsx` | Heavy rework of callback flow (state/timers) | High |

## Conclusion
Commit `1846fcc` is the first suspect commit as it introduced the significant rework of the callback flow and complex state management, likely leading to a race condition or stale `auth` reference during callback resolution.
