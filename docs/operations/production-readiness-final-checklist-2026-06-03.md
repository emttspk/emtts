# Production Readiness Final Checklist (2026-06-03)

## Scope
- Final go-live readiness verification for ePost.pk production.
- Documentation and operations checks only.
- No code, business logic, auth logic, scanner logic, or postal workflow changes.

## Pre-Flight Controls
- Confirm branch is `main` and latest production docs are committed.
- Confirm Railway project/environment are correctly linked (`Epost` / `production`).
- Confirm Cloudflare DNS and SSL settings are unchanged from approved baseline.
- Confirm rollback references are available (latest stable commit + runbook links).

## Final Checklist

### 1) Domain Health
- `https://epost.pk` returns 200 and renders homepage.
- `https://www.epost.pk` returns 200 and renders homepage.
- Canonical routing behavior is known and documented (apex vs www).
- TLS certificate is valid and not near expiry.

### 2) API Health
- `https://api.epost.pk/api/health` returns 200.
- API returns expected headers and no handshake/connection instability.
- No active API crash loop in Railway logs.

### 3) Login/Auth
- Login page loads without blank state.
- Valid user login succeeds.
- Invalid credential flow returns controlled error.
- Logout and refresh token flow behave as expected.

### 4) Barcode Scanner
- Scanner opens only after user taps Scan Barcode.
- Scanner panel appears above Track/Scan action buttons.
- Camera permission notice appears before prompt.
- Blocked permission message is clear and actionable.
- Retry Scanner and Close controls are visible and functional.

### 5) Label Generation
- Label generation entry flow opens and submits without UI/runtime errors.
- Generated artifacts are downloadable where expected.
- No regressions in layout or print preview visibility.

### 6) Money Orders
- Money order entry flow opens and validates expected fields.
- Money order generation path is available in production.
- No dependency/service errors are shown to users.

### 7) Tracking
- Public tracking route loads and accepts tracking IDs.
- Tracking results and empty/error states render correctly.
- Bulk tracking route remains accessible for authenticated operators.

### 8) Complaints
- Complaint entry route opens and submits controlled requests.
- Complaint status and reference visibility are intact.
- No timeout/regression behavior beyond known thresholds.

### 9) Billing/Packages
- Billing route loads and package plan cards render.
- Package fetch failures show safe retry/degraded UX.
- Payment state messaging (`success` / `failed` / `pending`) is consistent.

### 10) Admin Dashboard
- Admin entry routes load for authorized users.
- Core dashboard panels render without runtime errors.
- Background polling/widgets do not break page interaction.

### 11) Mobile UI
- Homepage, login, register, tracking, billing verified at mobile viewport.
- No horizontal overflow in critical forms and action panels.
- Inputs/buttons remain visible and tappable above fold where expected.

### 12) Build/Deploy
- `npm run build` completes successfully.
- Build artifacts are generated without critical warnings.
- Latest production deployment is healthy in Railway.

### 13) Railway/Cloudflare Checks
- Railway services (Web/Api/Worker/Python/DB/Redis) are online.
- Correct production environment variables are set (`VITE_API_URL`, `WEB_ORIGIN`, etc.).
- Cloudflare proxy mode and SSL mode are correct and stable.
- No DNS drift from approved production records.

## Release Decision Gate
Mark each item as PASS/FAIL and record timestamp + operator initials.

- Domain Health: [ ] PASS [ ] FAIL
- API Health: [ ] PASS [ ] FAIL
- Login/Auth: [ ] PASS [ ] FAIL
- Barcode Scanner: [ ] PASS [ ] FAIL
- Label Generation: [ ] PASS [ ] FAIL
- Money Orders: [ ] PASS [ ] FAIL
- Tracking: [ ] PASS [ ] FAIL
- Complaints: [ ] PASS [ ] FAIL
- Billing/Packages: [ ] PASS [ ] FAIL
- Admin Dashboard: [ ] PASS [ ] FAIL
- Mobile UI: [ ] PASS [ ] FAIL
- Build/Deploy: [ ] PASS [ ] FAIL
- Railway/Cloudflare: [ ] PASS [ ] FAIL

## Sign-Off
- Operator:
- Date/Time (UTC):
- Go-Live Decision: [ ] READY [ ] HOLD
- If HOLD, blocking reasons:
