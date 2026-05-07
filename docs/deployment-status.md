# Deployment Status (Railway)

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
