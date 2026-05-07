# Deployment Status

**Last Updated:** 2026-05-08  
**Commit:** b717fc5 — final repair complaint lifecycle dashboard sync cache and admin timeout  
**Railway Project:** 144be6f4-a17c-47ec-8c23-3d5963c4d5fb  
**Status:** ALL SERVICES ONLINE

## Services
- Api: ● Online · https://api.epost.pk · deployment 9ed33202
- Web: ● Online · https://www.epost.pk · deployment 18526b21
- Worker: ● Online · https://worker.epost.pk
- Python: ● Online · https://python.epost.pk

---
 (Railway)

## Latest Confirmed Runtime
Source: `temp-live-status-latest.utf8.json`

- Api service:
  - `serviceName: Api`
  - latest deployment status: `SUCCESS`
  - instance status: `RUNNING`
  - domain: `api.epost.pk`
- Web service:
  - `serviceName: Web`
  - latest deployment status: `SUCCESS`
  - instance status: `RUNNING`
  - domains: `epost.pk`, `www.epost.pk`

## Additional Production Checks
- Complaint finalization smoke passed (`temp-out-complaint-finalization.utf8.txt`).
- Refresh/cache unit protection passed (`temp-out-complaint-refresh-units.utf8.txt`):
  - `chargedUnits=0`
  - unit counters unchanged before/after refresh
- CNIC gate behavior verified (`temp-out-auth-cnic-smoke.utf8.txt`):
  - upload blocked without CNIC (400)
  - upload allowed with CNIC (200)
  - state restored after test
