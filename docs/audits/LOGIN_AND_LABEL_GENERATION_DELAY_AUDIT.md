# Login and Label Generation Delay Audit

## Date
- 2026-06-04

## Scope
- Login flow
- Dashboard first load
- File upload
- Generate-label waiting UX
- Timer/timeout UX only
- No business-logic, pricing, units, MO calculation, or PDF layout changes

## Protected Scope Verification
- Git remote: `https://github.com/emttspk/emtts.git` (PASS)
- Branch: `main` (PASS)
- Git status: clean (PASS)
- Railway expected target metadata from guard files: project `Epost`, environment `production`, services include `Api` and `Web` (PASS via repo guard files)
- Live Railway CLI verification: unavailable in current shell (`railway` not installed)

## Runtime Measurement Notes
- Browser-side probes from `http://localhost:3000/login` showed `ERR_CONNECTION_REFUSED` on `/api/auth/login`, `/api/me`, `/api/health` during this audit session.
- Because API was unreachable from this environment, direct end-to-end latency numbers are unavailable for authenticated paths.
- Audit therefore combines:
  - static code-path timing analysis
  - resilience fixes for slow/cold/unreachable API states
  - dev-only timing instrumentation to collect precise numbers once API is up

## Audit Checklist (1-20)
1. Password login API time: unavailable live (API unreachable); instrumentation added in auth route + login page.
2. Google login API time: unavailable live; instrumentation added for Firebase token exchange and total Google login flow.
3. Token/session restore time: measured in frontend via new dev-only timing around `setSession`.
4. `/api/me` time: unavailable live; backend and frontend dev timing added.
5. Dashboard summary/loading API time: static audit found duplicate pressure from bootstrap pattern; reduced redundant fetch path.
6. Frontend route transition delay: login now shows explicit full-screen transition overlay while dashboard bootstraps.
7. Railway cold start suspicion: high likelihood for perceived delays when API wakes slowly; UX now tolerates slow startup without fake expiry.
8. DB query delay suspicion: `/api/me` performs multiple sequential reads; timing breakdown added (`user`, `subscription`, `snapshot`, `complaintAllowance`).
9. Redis/session/token delay: upload queue path already uses timeout-wrapped Redis enqueue; frontend now exposes recoverable status checks.
10. Repeated `/api/me` calls: confirmed in bootstrap (`RequireProfileCompletion` + `AppShell`) and reduced via shared cached `fetchMe`.
11. Dashboard pre-render endpoint overfetch: dashboard no longer triggers extra forced stats refresh on mount beyond hook-managed fetch.
12. Frontend blocking non-critical data: shell now renders immediately and overlays only post-login handoff message.
13. Upload API time: unavailable live; dev timing added around upload stages and job creation request.
14. Parse/validation time: instrumented in upload flow (`upload_read_parse`, `upload_validation`).
15. Table preview rendering time: upload flow stage model now includes explicit preview stage in processing UX.
16. Job creation time: instrumented (`upload_create_job`).
17. Polling interval: remains 2s (`useJobPolling`) and unchanged.
18. Frontend timeout value: visual timer decoupled from hard failure; no visual expiry failure when backend still runs.
19. Early timer expiry cause: estimate-based remaining counter could hit 0 while backend still processing.
20. Blank/frozen processing screen: fixed with full-screen animated progress overlay + stage labels + elapsed status.

## Implemented Fixes

### A) Login and Dashboard UX
- Added post-login full-screen overlay text:
  - "Signing you in... loading dashboard"
- Dashboard shell now renders without blocking on `/api/me` completion.
- Added short-lived, shared `/api/me` cache and in-flight dedupe in `fetchMe`.
- Rewired profile gate to use cached `fetchMe`, reducing duplicate bootstrap calls.
- Removed extra dashboard mount-side forced stats fetch; hook cache/fetch path remains.
- Added dev-only timing logs (frontend + API auth/me).

### B) File Upload / Generate UX
- Added full-screen animated processing overlay with required steps:
  1. Uploading file
  2. Reading records
  3. Validating rows
  4. Creating preview table
  5. Preparing label job
- Shows elapsed time continuously and friendly long-run guidance.
- When estimate reaches zero but backend is still running, status now shows:
  - "Still working... checking progress"
- Added manual "Check status" action for long-running processing windows.
- Duplicate generate clicks remain blocked while upload/processing is active.

### C) Timeout Handling
- Visual timer no longer implies backend timeout.
- Processing UX now distinguishes:
  - queued state
  - active processing
  - still working beyond estimate
- Added recoverable status polling action instead of false expiry failure.

## Files Updated
- `apps/web/src/lib/devTiming.ts`
- `apps/web/src/lib/UserService.ts`
- `apps/web/src/components/RequireProfileCompletion.tsx`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/pages/Login.tsx`
- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/pages/Upload.tsx`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/me.ts`

## Validation Plan
- `npm run build`
- Run existing web/api tests if present and stable in environment
- After API is reachable, capture timing logs for:
  - login API
  - `/api/me`
  - upload parse/validation/job creation
  - queued/processing completion duration

## Residual Risks
- Live latency numbers are pending until API is reachable in this environment.
- Railway cold start and DB startup delay still depend on runtime infrastructure state.
