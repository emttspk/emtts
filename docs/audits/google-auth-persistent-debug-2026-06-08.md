# Google Auth Persistent Debug - 2026-06-08

## Scope

- Files:
  - `apps/web/src/pages/GoogleAuthCallback.tsx`
  - `apps/web/src/firebase.ts`
  - `apps/web/src/lib/googleAuth.ts`

## Storage Key

- `GOOGLE_AUTH_DEBUG`

## How To Retrieve Trace

- In the browser console:

```js
window.__GOOGLE_AUTH_DEBUG__
```

- Or directly from session storage:

```js
JSON.parse(sessionStorage.getItem("GOOGLE_AUTH_DEBUG"))
```

## Trace Fields

- `step`
- `uid`
- `email`
- `error`
- `timestamp`

## Behavior

- The trace is updated on every callback step.
- It survives the redirect back to `/register` because it is stored in `sessionStorage`.
- On successful dashboard load, the trace is cleared.
- On failure, the trace remains available.

## Validation

- `npm run build`: PASS

