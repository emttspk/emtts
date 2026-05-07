# Deployment Status

**Last Updated:** 2026-05-08  
**Commit:** d05bb44 — final correction delete verification stats wiring cache hydration and sample complaint  
**Railway Project:** 144be6f4-a17c-47ec-8c23-3d5963c4d5fb  
**Status:** ALL SERVICES ONLINE

## Services
- Api: Online · https://api.epost.pk · deployment 9ed33202
- Web: Online · https://www.epost.pk · deployment 18526b21
- Worker: Online
- Python: Online

## Latest Confirmed Runtime
- Api health endpoint: `GET /api/health -> 200 {"status":"ok"}`
- Stats endpoint includes final amount fields:
  - `totalAmount=1076725`
  - `deliveredAmount=14825`
  - `pendingAmount=1059300`
  - `returnedAmount=2600`
  - `complaintAmount=98175`
  - `complaints=96`

## Final Production Checks
- Real deletable plan test passed: create -> delete `200` -> gone from admin API -> gone from public plans API.
- Protected delete test passed: `409` with exact blocker counts.
- Complaint reopen verification passed: past-due complaint is not blocked; worker timeout accepted as queued request.
- Unified stats verification passed across Dashboard, Bulk Tracking, and Complaints.
- Cache hydration wiring present for dashboard and tracking workspace.
- Sample complaint document created: `docs/samplecomplaint.md`.
