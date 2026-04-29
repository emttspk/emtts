# Complaint System — Full Lifecycle

## Overview
The complaint system automates Pakistan Post complaint registration via the ep.gov.pk ASP.NET portal. It handles district/tehsil/location hierarchy, retry on network failures, duplicate detection, and persistent status tracking.

## Flow

```
User (BulkTracking.tsx)
  ↓ POST /api/tracking/complaint
Node API (apps/api/src/routes/tracking.ts)
  ↓ Validates fields, checks for existing active complaint (409)
  ↓ Builds complaintContext from shipment rawJson + user profile
  ↓ Calls pythonSubmitComplaint()
Python Service (python-service/app.py)
  ↓ Resolves complaint form URL
  ↓ Article No postback → DDDistrict postback → DDTehsil postback → DDLocations
  ↓ Fills all required form fields
  ↓ Submits with fuplAttatchment (empty file)
Pakistan Post (ep.gov.pk)
  ↓ Returns complaint ID (CMP-XXXXXX) and due date
Node API
  ↓ Parses complaint ID and due date from response
  ↓ Stores in shipment.complaintText and shipment.complaintStatus = "FILED"
  ↓ Charges COMPLAINT_UNIT_COST from user's unit balance
  ↓ Returns complaintId, dueDate, trackingId to frontend
Frontend
  ↓ Closes modal, refreshes shipments list
  ↓ Row now shows Complaint ID badge instead of button
```

## Required Fields
All of these must be non-empty and not "-" for the complaint to proceed:
- `ArticleNo` — tracking number
- `SenderName` — sender's company/name
- `SenderAddress` — sender's address
- `ReceiverName` — consignee name
- `ReceiverAddress` — consignee address
- `SenderCity` — sender city (matched to dropdown)
- `ReceiverCity` — receiver city (matched to dropdown)
- `District` — district ID from ep.gov.pk hierarchy
- `Tehsil` — tehsil ID from ep.gov.pk hierarchy
- `DeliveryOffice` — delivery location ID from ep.gov.pk hierarchy
- `Mobile` — 03XXXXXXXXX formatted phone
- `Remarks` — complaint text

## Autofill Logic
The district/tehsil/location hierarchy is auto-resolved from `city/post office list.csv`:
1. Delivery office from tracking events → matched against CSV
2. Prefill endpoint (`/api/tracking/complaint/prefill/:tn`) returns matched district/tehsil/location
3. Frontend uses `resolveComplaintHierarchyRow()` for fuzzy matching
4. If no match, uses first available district/tehsil/location as fallback

## Duplicate Handling
- Before submission, `parseStoredComplaintLifecycle()` checks `shipment.complaintText` for an existing `COMPLAINT_ID` with a future `DUE_DATE`
- If active: returns HTTP 409 with existing `complaintId` and `dueDate`
- Frontend shows "Complaint already active" alert and does not re-submit

## Storage Format
```
COMPLAINT_ID: CMP-984183 | DUE_DATE: 03-05-2026
User complaint:
[user remarks]

Response:
[full response text from Pakistan Post]
```

## Unit Consumption
- `COMPLAINT_UNIT_COST` units are deducted on `FILED` status only
- Daily and monthly limits enforced via `getComplaintAllowance()`
- On `FAILED` status, units are NOT charged (or refunded if pre-checked)

## Retry Logic
- 3 attempts max with delays: 2s / 4s / 8s between retries
- Retries triggered on: `ConnectionReset`, `ReadTimeout`, `ConnectionError`, `ProtocolError`
- Per-request timeout: 90 seconds
