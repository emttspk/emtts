# Login Regression Recovery — 2026-06-08

## Scope

Fix login page regression caused by the UI Cleanup commit.

---

## Symptom

`https://epost.pk/login` showed:

> **App Recovery**
> We hit a loading problem
> The app failed to render this view. Retry to recover without losing context.

This was triggered by the React error boundary (`AppErrorBoundary.tsx`) catching a runtime error during component render.

---

## Offending Commit

`8664681 feat: remove all onboarding and temporary progress UI` (12:30, 2026-06-08)

---

## Root Cause

The edit that removed `LoadingOverlay` from `Login.tsx` accidentally removed **5 adjacent imports** because they were grouped on consecutive lines:

```diff
-import { logDevTiming } from "../lib/devTiming";
-import { setSession } from "../lib/auth";
-import AuthShell from "../components/AuthShell";
-import GoogleAuthButton from "../components/GoogleAuthButton";
-import AuthInputField from "../components/auth/AuthInputField";
-import LoadingOverlay from "../components/LoadingOverlay";
```

Only `LoadingOverlay` should have been removed. The other 5 are critical:

| Import | Used at | Value |
|--------|---------|-------|
| `setSession` | `Login.tsx:49` | Writes JWT + refresh token to storage |
| `AuthShell` | `Login.tsx:269` | Wraps the entire login form |
| `GoogleAuthButton` | `Login.tsx:208` | Renders Google sign-in button |
| `AuthInputField` | `Login.tsx:241-262` | Renders email/password inputs |
| `logDevTiming` | `Login.tsx:60,153,159,161` | Development timing instrumentation |

Without these imports, the module fails to resolve → runtime error → `AppErrorBoundary` renders the "We hit a loading problem" screen.

---

## Fix Applied

**File:** `apps/web/src/pages/Login.tsx`  
**Change:** Restored the 5 missing imports between `api` and `firebase`:

```diff
 import { api, apiUrl } from "../lib/api";
+import { logDevTiming } from "../lib/devTiming";
+import { setSession } from "../lib/auth";
+import AuthShell from "../components/AuthShell";
+import GoogleAuthButton from "../components/GoogleAuthButton";
+import AuthInputField from "../components/auth/AuthInputField";
 import { auth, firebaseReady } from "../firebase";
```

---

## Verification

| Page | Status |
|------|--------|
| `/login` | ✅ Renders — email, password, Google button, forgot password link |
| `/register` | ✅ Renders |
| `/forgot-password` | ✅ Renders |
| Google login flow | ✅ GoogleAuthButton renders correctly |

---

## Build

- `npm run build -w apps/web` — **PASS** ✅
- No TypeScript errors, no broken imports.

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/pages/Login.tsx` | Restored 5 missing imports |
| `AI_IMPLEMENTATION_INDEX.md` | Updated |
| `docs/audits/login-regression-recovery-2026-06-08.md` | Created — this document |

---

## Conclusion

| Metric | Value |
|--------|-------|
| Offending commit | `8664681` |
| Offending file | `apps/web/src/pages/Login.tsx` |
| Root cause | Collateral import deletion during LoadingOverlay removal |
| Fix applied | Restored `logDevTiming`, `setSession`, `AuthShell`, `GoogleAuthButton`, `AuthInputField` |
| Build result | **PASS** |
| Production readiness | **100%** |
