# Frontend UI + First-Load Audit Report (2026-06-03)

## Scope
- Frontend UI/UX and responsiveness only.
- First-load blank screen and loading-delay reliability only.
- No protected business module logic changes.

## Safety Snapshot
- Git remote: `https://github.com/emttspk/emtts.git`
- Branch: `main`
- Railway: Project `Epost`, Environment `production`, Service `Api` online

## Blank First-Load Root Cause
- Primary root cause pattern: lazy chunk mismatch/fetch failure during first open after deploy/client cache drift.
- Production forensic signal: mobile run showed aborted request for register route chunk and produced blank page state.
- Existing app startup flow did not provide a top-level error recovery UI when lazy route chunk load failed.

## Fixes Implemented

### Reliability
- Added app-level runtime boundary:
  - File: `apps/web/src/components/AppErrorBoundary.tsx`
  - Adds user-safe recovery actions: `Retry App` and `Reload Page`
- Wrapped route tree with boundary + suspense fallback:
  - File: `apps/web/src/App.tsx`
- Added Vite preload error recovery:
  - File: `apps/web/src/main.tsx`
  - Handles `vite:preloadError` and performs one-time safe reload
- Improved pre-hydration fallback markup:
  - File: `apps/web/index.html`
  - Ensures visible startup skeleton before JS boot
- Reduced first-route latency by eager-loading critical public/auth routes:
  - File: `apps/web/src/App.tsx`

### UI Polish (Homepage + Cards + Auth/Profile Inputs)
- Product module cards upgraded:
  - File: `apps/web/src/components/OperationsModules.jsx`
  - Larger and sharper module images
  - Stronger card hierarchy and CTA placement
  - Better mobile spacing and no clipping
  - Added non-blocking plans retry UI if API call fails
- Auth/profile/account input visibility improved:
  - Files:
    - `apps/web/src/components/auth/AuthInputField.tsx`
    - `apps/web/src/index.css`
  - Stronger border contrast, clearer text color, better disabled/focus behavior
- Auth shell and nav readability improvements:
  - Files:
    - `apps/web/src/components/AuthShell.tsx`
    - `apps/web/src/components/Navbar.jsx`

### Performance
- Vite manual chunk split added:
  - File: `apps/web/vite.config.ts`
  - Chunks: `react-core`, `firebase`, `motion`, `icons`, `xlsx`
- Key image loading optimization:
  - Added async decoding and selective load priority for above-the-fold brand/module visuals

## Mobile QA Results
- Verified routes on mobile viewport in browser automation:
  - `/`
  - `/login`
  - `/register`
  - `/register/profile`
  - `/settings`
- Result on local preview build:
  - No blank first screen
  - No horizontal overflow
  - Inputs readable and visible
  - Borders clearly visible

## Build Performance Snapshot
- Build command: `npm run build`
- Result: PASS
- Notable result after chunk split:
  - Dedicated vendor chunks now emitted (`react-core`, `firebase`, `motion`, `icons`, `xlsx`)
  - Initial app chunk profile improved for cache reuse across routes

## Validation
- `npm run lint` -> PASS
- `npm run typecheck` -> PASS
- `npm run build` -> PASS

## Before / After Summary
- Before:
  - First-load blank risk on chunk mismatch had no explicit recovery UI
  - Product cards looked flat, images too small
  - Mobile input contrast could appear dim in auth/profile screens
- After:
  - Chunk mismatch handled with auto-recovery + visible user recovery controls
  - Product cards now premium with larger visual assets and stronger hierarchy
  - Auth/profile inputs have stronger borders, clearer contrast, and improved mobile readability

## Remaining Risks
- True production confirmation of chunk-recovery behavior needs post-deploy live verification on `www.epost.pk` after cache churn.
- API plans endpoint CORS may fail in local preview context against production domain, but UI now degrades safely with retry notice.

## Customer Login Readiness
- Login/register visual and first-load reliability readiness: HIGH.
- Residual risk level: LOW after deployment verification pass.

---

## Production Domain Status Addendum (2026-06-03)

Post-deploy production connectivity audit performed. See full report: `docs/operations/production-domain-connectivity-audit-2026-06-03.md`

### Reported Symptoms
- Chrome `ERR_CONNECTION_CLOSED` on `www.epost.pk` immediately after deploy
- `Failed to reach API endpoint https://api.epost.pk/api/auth/login` shown on login page

### Verified Status (all URLs confirmed operational)

| URL | Status |
|-----|--------|
| `https://epost.pk` | ✅ 200 OK |
| `https://www.epost.pk` | ✅ 200 OK |
| `https://www.epost.pk/login` | ✅ 200 OK, login form loaded |
| `https://api.epost.pk/api/health` | ✅ 200 OK |
| `https://api.epost.pk/api/auth/login` POST | ✅ 401 (correct: invalid test creds) |

### Root Cause Confirmed
Transient Railway container restart window during `0903343` deploy. Self-resolved within deployment window. No persistent infrastructure fault. No code changes required.

---

## Homepage Barcode Scanner UX Addendum (2026-06-03)

Detailed report: `docs/operations/barcode-scanner-mobile-ux-audit-2026-06-03.md`

### Scope
- Homepage track parcel scanner UI only.
- Camera permission messaging and retry UX only.
- Mobile form layout stabilization only.

### Improvements
- Scanner panel moved above Track and Scan Barcode buttons.
- Tracking input remains visible while scanner is open.
- Added pre-permission guidance before camera request prompt.
- Added explicit blocked-permission recovery message with browser settings guidance.
- Added Retry Scanner button.
- Preserved user-initiated camera opening only (no page-load auto open).
