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
