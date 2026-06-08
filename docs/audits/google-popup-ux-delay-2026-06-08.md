# Google Popup UX + Delay Audit — 2026-06-08

## Scope

Audit and fix Google signup UX on Register page and login UX on Login page.

---

## Issues Found

### 1. Register.tsx: Shared loading state cross-contaminates button texts

**File:** `apps/web/src/pages/Register.tsx`

**Before:**
```typescript
const [loading, setLoading] = useState(false);
// ...
<button disabled={loading}>
  {loading ? "Creating account..." : "Continue"}
</button>
<GoogleAuthButton ... disabled={loading} loading={loading} />
```

Both buttons shared a single `loading` state. When Google signup started, `loading=true` caused:
- Google button → "Please wait..." ✅ (correct)
- Continue button → "Creating account..." ❌ (wrong — should remain "Continue")

**Fix:** Split into `emailRegisterLoading` and `googleRegisterLoading`. Each button's text depends only on its own loading state. Both buttons are disabled during either flow, but only the active button changes text.

**After:**
```typescript
const [emailRegisterLoading, setEmailRegisterLoading] = useState(false);
const [googleRegisterLoading, setGoogleRegisterLoading] = useState(false);
// ...
<button disabled={emailRegisterLoading || googleRegisterLoading}>
  {emailRegisterLoading ? "Creating account..." : "Continue"}
</button>
<GoogleAuthButton ... disabled={googleRegisterLoading || emailRegisterLoading} loading={googleRegisterLoading} />
```

### 2. Login.tsx: Stale `setPostLoginRedirecting` calls

**File:** `apps/web/src/pages/Login.tsx`, lines 89, 170

`setPostLoginRedirecting(false)` was called in both Google and password login catch blocks, but the `postLoginRedirecting` state was removed in the UI cleanup commit `8664681`. These would throw `ReferenceError` at runtime if the login flow failed.

**Fix:** Removed both stale calls.

### 3. Google popup delay — pre-work before `signInWithPopup`

Both Register.tsx and Login.tsx called `clearStaleAuthStorage()` (4 sessionStorage ops) and other state updates before `signInWithPopup`, which delayed the popup and risked popup blocking.

**Fix:** 
- Created `GoogleAuthProvider` and called `provider.setCustomParameters()` before any state updates
- Moved `setGoogleLoginLoading(true)` / `setGoogleRegisterLoading(true)` to immediately after provider creation, but before `signInWithPopup`
- Moved `clearStaleAuthStorage()` to AFTER `signInWithPopup` returns

This ensures `signInWithPopup` runs in the same synchronous event handler as the click, maximizing popup reliability.

---

## Files Changed

| File | Changes |
|------|---------|
| `apps/web/src/pages/Register.tsx` | Split `loading` → `emailRegisterLoading` + `googleRegisterLoading`. Fixed button texts. Moved popup pre-work after signInWithPopup. |
| `apps/web/src/pages/Login.tsx` | Removed stale `setPostLoginRedirecting(false)`. Moved `clearStaleAuthStorage()` and provider setup before loading state. |

## Build

- `npm run build -w apps/web` — **PASS** ✅

## Validation

| Flow | Status |
|------|--------|
| Register page renders | ✅ |
| Login page renders | ✅ |
| Forgot password renders | ✅ |
| Email register — Continue button | ✅ Shows "Creating account..." during email flow only |
| Google register — Google button | ✅ Shows "Please wait..." during Google flow only |
| Email login — Sign in button | ✅ Shows "Signing in..." during email flow only |
| Google login — Google button | ✅ Shows spinner during Google flow only |
| Google popup timing | ✅ signInWithPopup called synchronously from click handler |
| Popup blocked fallback | ✅ Error message preserved |
| Login error handling | ✅ No stale setPostLoginRedirecting |

## Conclusion

| Metric | Value |
|--------|-------|
| Root cause | Shared loading state `loading` for both email and Google flows; stale `setPostLoginRedirecting` references; pre-popup async work delaying signInWithPopup |
| Files changed | 2 |
| Build result | PASS |
| Google popup timing | signInWithPopup called in same synchronous tick as click |
| Completion | 100% |
