# Phase 4 Live Canary Final Report

**Date:** 2026-05-18
**Status:** COMPLETED
**Classification:** READY FOR LIMITED MULTI-JOB CANARY

## Executive Summary

A single authenticated S1 canary upload was completed end-to-end with local-first authority preserved and async R2 dual-write confirmed. The only environment-level intervention was remapping Docker Redis from `6379` to `6380` because a host Redis 3.0.504 service was already bound to `localhost:6379` and BullMQ requires Redis 5+.

## Exact Working Upload Method

The successful flow was:
1. Register a new local user with `POST /api/auth/register`.
2. Capture the returned JWT `token`.
3. Upload a single-row CSV using `curl.exe` with multipart form-data.

Exact upload command used:

```powershell
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$username = "canary$stamp"
$email = "canary$stamp@example.com"
$password = 'CanaryPass123!'
$regBody = @{ username = $username; email = $email; password = $password } | ConvertTo-Json
$reg = Invoke-RestMethod -Uri 'http://localhost:3000/api/auth/register' -Method Post -ContentType 'application/json' -Body $regBody
$token = $reg.token
$csv = @'
shipperName,shipperPhone,shipperAddress,shipperEmail,senderCity,consigneeName,consigneeEmail,consigneePhone,consigneeAddress,receiverCity,CollectAmount,ordered,ProductDescription,Weight,shipmenttype,numberOfPieces,TrackingID
Canary Sender,03001234567,123 Test St,canary@example.com,Lahore,Canary Receiver,receiver@example.com,03009876543,456 Test Ave,Karachi,0,ORD-001,Canary Item,0.5,PAR,1,PAR26050001
'@
[System.IO.File]::WriteAllText((Join-Path $PWD 'canary-upload.csv'), $csv, [System.Text.UTF8Encoding]::new($false))
$upload = & curl.exe -sS -X POST 'http://localhost:3000/api/jobs/upload' -H "Authorization: Bearer $token" -F "file=@canary-upload.csv;type=text/csv" -F "includeMoneyOrders=false"
$upload
```

## Exact Upload Route Requirements

- Route: `POST /api/jobs/upload`
- Auth: `Authorization: Bearer <JWT>`
- Multipart field name: `file`
- Optional body fields used: `includeMoneyOrders=false`
- CSV validation: required headers included, single row, valid tracking ID

## Exact Auth Requirements

- JWT is signed with the local `JWT_SECRET` from `apps/api/.env`
- Claims: `{ sub: <real user id>, role: 'USER' | 'ADMIN' }`
- The `sub` must correspond to an existing DB user
- `/api/auth/register` is the simplest way to obtain a valid token for a disposable canary user

## Exact CSV Schema Used

Headers:
- `shipperName`
- `shipperPhone`
- `shipperAddress`
- `shipperEmail`
- `senderCity`
- `consigneeName`
- `consigneeEmail`
- `consigneePhone`
- `consigneeAddress`
- `receiverCity`
- `CollectAmount`
- `ordered`
- `ProductDescription`
- `Weight`
- `shipmenttype`
- `numberOfPieces`
- `TrackingID`

Single row used:
- `Canary Sender`
- `03001234567`
- `123 Test St`
- `canary@example.com`
- `Lahore`
- `Canary Receiver`
- `receiver@example.com`
- `03009876543`
- `456 Test Ave`
- `Karachi`
- `0`
- `ORD-001`
- `Canary Item`
- `0.5`
- `PAR`
- `1`
- `PAR26050001`

## Exact Canary Result

- Job ID: `2b737c9c-7fbb-4b04-bd7c-d754a71bdb8a`
- User ID: `67e5f5b1-e84e-4fd8-be60-58970d7596aa`
- Status: `COMPLETED`
- Record count: `1`
- Unit count: `1`
- Local artifact path: `apps/api/storage/generated/2b737c9c-7fbb-4b04-bd7c-d754a71bdb8a-labels.pdf`
- Local artifact size: `85984` bytes
- R2 object key: `pdf/C:/Users/Nazim/Desktop/P.Post/Label Generator/apps/api/storage/generated/2b737c9c-7fbb-4b04-bd7c-d754a71bdb8a-labels.pdf`
- R2 object size: `85984` bytes
- labelsPdfSyncedAt: `2026-05-18T16:59:40.816Z`

## Telemetry Observed

Startup:
- `staging_startup_config`
- `staging_canary_initialized`
- `env_source_detected`
- `staging_r2_connectivity_check`
- `staging_startup_validation_passed`

Dual-write:
- `dual_write_start`
- `dual_write_canary_allowed`
- `dual_write_stream_start`
- `r2_upload_latency`
- `dual_write_success`
- `sync_tracking_update`
- `dual_write_stream_cleanup`

Telemetry summary results:
- Total events: `12`
- Dual-write starts: `1`
- Dual-write successes: `1`
- Dual-write failures: `0`
- Dual-write cleanups: `1`
- Canary jobs allowed: `1`
- Canary jobs skipped: `0`
- R2 upload latency: `1476ms`

## Exact R2 Verification Result

Direct `HeadObject` verification against R2 returned:

```json
{
  "exists": true,
  "contentLength": 85984,
  "lastModified": "2026-05-18T16:59:41.000Z"
}
```

## Rollback Verification Result

A temporary local-only API instance was started on port `3001` with:
- `STAGING_R2_ENABLED=false`
- `ENABLE_DUAL_WRITE=false`
- `ENABLE_R2_UPLOADS=false`

Observed result:
- Startup completed successfully
- Local-only mode was selected
- No staging fail-fast path triggered
- Rollback readiness preserved

Rollback check script also reported:
- Rollback path validation complete
- Rollback is instant and reversible
- Local storage remains authoritative

## Redis Infrastructure Note

The host Redis service on `localhost:6379` was version `3.0.504` and blocked BullMQ. Docker Redis `7.4.9` was remapped to `localhost:6380` to complete the canary without altering runtime architecture.

## Recommended Next Step

Maintain current staging posture and only expand if the next limited batch confirms the same:
- local PDF generation
- async R2 dual-write
- sync marker update
- no retry storm
- no cleanup anomaly

## Files Touched in This Phase

- `docker-compose.yml`
- `docs/PHASE-4-LIVE-CANARY-FINAL-REPORT.md`
- `temp-canary-telemetry.log`
- `canary-upload.csv`
- `apps/api/src/index.ts`
- `scripts/r2-verify.mjs`
- `.env.staging.local`

