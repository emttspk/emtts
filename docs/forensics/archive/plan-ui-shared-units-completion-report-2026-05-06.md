# Plan UI Simplification + Shared Units Completion Report

Date: 2026-05-06
Environment: Production
API Base: https://api.epost.pk

## Scope Completed

- Simplified Admin plan create/edit inputs to required fields only:
  - Plan Name
  - Price
  - Discount Price (optional)
  - Total Shared Units
  - Daily Complaint Limit
  - Monthly Complaint Limit
  - Suspended
- Kept backend compatibility by deriving legacy payload fields from shared units.
- Standardized plan presentation wording across homepage, billing, dashboard, workspace, settings, and admin cards:
  - Total Shared Units
  - Services Included: Labels, Tracking, Money Orders, Complaints
  - Complaint Cost: 10 Units Each
  - Complaint Limits: X/day, X/month
- Addressed stale plan behavior:
  - Added cache-busting query parameter to plan fetches on web.
  - Added no-store cache headers on API plans endpoint.
- Enforced public plan visibility rules:
  - Public `/api/plans` now excludes suspended plans.
  - Admin page reads `/api/admin/plans` so suspended/legacy plans remain manageable.
- Live canonical cleanup performed:
  - Legacy Trail suspended and retained as historical/legacy record.
  - Public plans now show canonical set only: Free Plan, Standard Plan, Business Plan.

## Validation Commands

Executed from workspace root:

- `npm install` -> success
- `npm run lint` -> success
- `npm run typecheck` -> success
- `npm run build` -> success
- `npm run test` -> success (Railway smoke test passed)
- `npm run dev` -> web/api dev startup confirmed

## Deployment

- `railway up --service Api --detach` -> deployment `eec609e1-c603-4797-9fa2-647e9ae90070` -> SUCCESS
- `railway up --service Web --detach` -> deployment `f3c34209-b208-4b44-acf7-8bb797bd0aba` -> SUCCESS

## Live Canonical Verification Evidence

Artifact: `temp-live-canonical-plan-cleanup-report.json`

- Admin plans include canonical plans plus suspended legacy plan:
  - Legacy Trail (suspended)
  - Free Plan
  - Standard Plan
  - Business Plan
- Public plans include canonical plans only:
  - Free Plan
  - Standard Plan
  - Business Plan

## Notes

- Legacy Trail was not hard-deleted because historical billing references are protected by backend delete guards.
- The plan is operationally removed from customer-facing plan lists through suspension + public endpoint filtering.
