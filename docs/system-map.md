# System Map — Module Dependencies

## Complaint Module

```
apps/web/src/pages/BulkTracking.tsx
  ├── openComplaintModal()       — prefill form from shipment data + /api/tracking/complaint/prefill/:tn
  ├── submitComplaintInstant()   — validates fields, POST /api/tracking/complaint
  ├── parseComplaintLifecycle()  — reads complaintText blob for active complaint detection
  └── complaint counters         — from me?.balances.complaintDailyUsed / complaintMonthlyUsed

apps/api/src/routes/tracking.ts
  ├── GET  /complaint/prefill/:tn — resolves district/tehsil/location from CSV
  ├── POST /complaint             — validates, builds context, calls Python, stores result
  ├── parseStoredComplaintLifecycle() — parses stored COMPLAINT_ID/DUE_DATE
  └── imports: getComplaintAllowance, recordUnitsUsed (unitConsumption.ts)

apps/api/src/usage/unitConsumption.ts
  ├── getComplaintAllowance()    — daily/monthly counts from usage_logs, limit from plan
  ├── recordUnitsUsed()          — charges COMPLAINT_UNIT_COST on FILED status
  └── COMPLAINT_UNIT_COST        — constant for units per complaint

apps/api/src/routes/me.ts
  └── GET /api/me                — exposes complaintDailyLimit/Used/Remaining + complaintMonthlyUsed

python-service/app.py
  ├── submit_complaint()         — drives ep.gov.pk ASP.NET form submission
  ├── _resolve_complaint_form_page() — resolves actual form URL
  ├── _is_retryable_complaint_error() — ReadTimeout/ConnectionReset/ConnectionError/ProtocolError
  ├── COMPLAINT_FORM_TIMEOUT_SECONDS = 90
  ├── COMPLAINT_MAX_RETRIES = 3
  └── COMPLAINT_RETRY_DELAYS = [2, 4, 8]

city/post office list.csv
  └── District/Tehsil/Location hierarchy used by prefill endpoint
```

## Data Store
```
PostgreSQL (Railway)
  shipment table
    ├── complaintStatus  — NOT_REQUIRED | FILED | FAILED
    ├── complaintText    — COMPLAINT_ID: xxx | DUE_DATE: dd-mm-yyyy\n...
    └── complaintEligible, complaintDate

  usage_logs table (raw SQL)
    └── action_type='complaint', status='CONSUMED', user_id, created_at
```
