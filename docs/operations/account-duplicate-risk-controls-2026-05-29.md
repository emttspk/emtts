# Account Duplicate-Risk Controls Runbook - 2026-05-29

## Scope
This runbook covers the auth/session and sender-profile controls delivered on 2026-05-29:
- 15-minute idle logout redirect to login.
- Login method-specific loading states.
- Sender `contactNumber` and `cnic` immutability after first verified save.
- Persistent duplicate-risk signal storage and admin warnings.

## Behavior Summary
- Idle timeout redirects:
  - Production host (`www.epost.pk` / `epost.pk`) -> `https://www.epost.pk/login`
  - Local/dev -> `/login`
- Sender profile immutable fields:
  - Normal user updates reject changes to previously set `contactNumber` or `cnic`.
  - API error: `Contact number/CNIC cannot be changed after verification. Contact support/admin for correction.`
- Admin correction path:
  - Admin can patch user contact/CNIC from admin user edit route.

## Duplicate-Risk Signal Model
Prisma model: `AccountRiskSignal`
- `signalType`: `IP_HASH` | `DEVICE_HASH` | `CONTACT_HASH` | `CNIC_HASH` | `NAME_CONTACT_HASH`
- `signalHash`: SHA-256 with server salt (`ACCOUNT_RISK_SIGNAL_SALT`)
- `source`: event source (`REGISTER`, `PROFILE_UPDATE`, `*_DUPLICATE_ATTEMPT`, etc.)
- `planTier`: `FREE` | `PAID` | `UNKNOWN`

Signals are stored hashed only. Raw IP is not returned to admin UI payloads.

## Admin Warning Surface
Endpoint: `GET /api/admin/users`
- Returns `duplicateRisk` per user:
  - `level`: `none` | `low` | `medium` | `high` | `review`
  - `reasons`: short reason list
  - `reviewHint`
  - `lastSeenAt`
  - `reviewStatus` / `reviewedAt` / `reviewedBy` (if reviewed by admin)

Admin UI: Users tab in Admin Command Center shows a risk badge and concise reasons.

## Admin User Control Restore
The Users tab now supports full operational controls again:
- View customer detail modal (`GET /api/admin/users/:userId`)
- Edit/unlock flow for company/contact/CNIC with required admin note + confirmation
- Add credits/units flow with required confirmation and reason note
- Suspend/reactivate, delete (guarded by linked-record safety)
- Duplicate-risk `Allow / Mark Reviewed` action

### Duplicate-risk review action
Endpoint: `POST /api/admin/users/:userId/duplicate-risk/review`
- Body:
  - `action`: `ALLOW` or `REVIEW`
  - `note`: required admin note
- Effect:
  - Persists admin review signal in `AccountRiskSignal` (`signalType = RISK_REVIEW`)
  - Updates Users risk surface with review status metadata

### Admin correction logging
- CNIC/contact corrections and duplicate-risk review actions are logged through existing admin audit helper (`logComplaintAudit`) with actor + note context.

## Migration Notes
Local command attempted:
- `npm run prisma:migrate --workspace=@labelgen/api -- --name account-risk-signals-may29`

Result:
- Cancelled due local DB drift reset prompt (destructive reset was declined).

Migration file created manually:
- `apps/api/prisma/migrations/20260529113000_add_account_risk_signal/migration.sql`

### Production-safe apply command
Use non-destructive deploy migration flow in production:
```bash
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```

## Verification Checklist
1. `npm run prisma:generate --workspace=@labelgen/api`
2. `npm run build`
3. `npm run lint`
4. `npm run typecheck`
5. Manual checks:
- idle timeout lands on login
- password vs Google loading labels are isolated
- immutable contact/CNIC rejects user edits
- admin users tab shows duplicate-risk badge/reasons

## 2026-06-03 Addendum - Firebase Verification Flow Stabilization

### Root Cause Found
- Login path checked `emailVerified` without `user.reload()`, causing stale verification state.
- Verify-email resend lacked cooldown and debounce, enabling rapid attempts and Firebase lockout risk.
- Verify-email continue action lacked debounce, enabling repeated checks and noisy error loops.
- Session expiry on verify screen was not explicitly handled for user guidance.

### Auth Files Inspected
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Register.tsx`
- `apps/web/src/firebase.ts`
- `apps/web/src/components/AuthShell.tsx`
- `apps/web/src/main.tsx`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/middleware/auth.ts`

### Auth Files Changed
- `apps/web/src/lib/firebaseAuthGuards.ts` (new)
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Register.tsx`
- `scripts/auth-hammer-test.mts` (new)
- `package.json`

### Exact Fixes
- Added client-side debounce/throttle for login submit, resend verification, and continue verification.
- Added resend cooldown timer with visible countdown and disabled resend button state.
- Added friendly Firebase lockout message:
  - `Too many attempts. Please wait 10 to 15 minutes before trying again.`
- Added `credential.user.reload()` before login email verification checks.
- Added explicit session-expired guidance when `auth.currentUser` is unavailable.
- Kept behavior safe: no auto resend on page load.
- Added mobile-safe verify email text wrapping (`break-all`) to avoid overflow.

### Hammer Test (Mocked, Safe)
- Command: `npm run auth:hammer`
- Simulates 50 users with rapid resend/continue/login attempt patterns and mobile reload cycles.
- No real Firebase email send spam.
- Result: PASS

### Customer-Facing Expected Behavior
- Verified users can complete continue/login without stale unverified false negatives.
- Resend is clearly rate-limited with countdown and pending disabled state.
- Lockout is explained with a clear wait-time message.
- Users with expired auth session are redirected by clear login guidance instead of looping.

## 2026-06-03 Addendum - Final Production Auth Risk Closure

### Closure Summary
- Durable refresh token persistence moved from in-memory state to DB-backed storage (`AuthRefreshToken`).
- Logout now attempts backend refresh-token revocation before local/session storage cleanup.
- Production Firebase manual verification checklist and production auth smoke checklist were added to:
  - `docs/operations/production-auth-hardening-report-2026-06-03.md`

### Remaining Open Risks
- Firebase Console settings are still a manual operational verification item.
- Browser storage token model remains less secure than HttpOnly cookie model and is tracked as future hardening.

### Production Verification Note
- Production deployment verification on 2026-06-03 confirmed Api health and protected endpoint behavior.
- Full success-path customer login proof remained blocked in that pass because no smoke credentials were present in linked production Api env and no browser tool was available.
