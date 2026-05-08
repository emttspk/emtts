# Test File Exemption System

## Objective

Allow specific upload filenames to bypass duplicate-completed-job rejection while preserving existing duplicate protection for all other files.

## Implemented Behavior

- Duplicate filename rejection still checks against completed jobs only.
- Before blocking with `409`, the API now checks if the filename is in the exemption list.
- Exempt filename match is case-insensitive and trim-safe.
- If exempt, upload proceeds and existing business logic remains unchanged.

## Default Exempt Filename

- `LCS 15-13-11-2024.xls`

## Storage Design (Safe / Additive)

- Added runtime settings storage via auto-created DB table:
  - `app_runtime_settings`
- Key used:
  - `upload.exemptFileNames`
- Value stored as JSON array.
- Table is created with `CREATE TABLE IF NOT EXISTS` only (no destructive migration).

## Admin Configuration

- Admin Billing Settings now includes `exemptFileNames` in API GET/PUT.
- Admin UI section added:
  - "Allow Test File Names"
  - One filename per line.
  - Supports add/edit/remove by editing list.

## Files Changed

- `apps/api/src/services/upload-file-exemptions.service.ts` (new)
- `apps/api/src/routes/jobs.ts`
- `apps/api/src/routes/admin.ts`
- `apps/web/src/pages/Admin.tsx`

## Validation Summary

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm run test`: PASS (`smoke:railway`)
