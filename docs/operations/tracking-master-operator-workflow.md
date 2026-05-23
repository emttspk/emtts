# Tracking Master Operator Workflow

## Purpose
Use one authoritative export between Generate Labels and Track Parcel so tracking, complaint, and settlement workflows remain aligned.

## End-to-End Steps
1. Generate labels in Generate Labels.
2. Wait for completion panel and download:
   - Labels PDF
   - Money Orders PDF (if enabled)
   - Tracking Master File (.xlsx)
  - Note: Tracking Master File is generated for every successful job, even when "Track shipments after generating labels" is unchecked.
3. Open Track Parcel (`/tracking-workspace`).
4. Upload the same Tracking Master File.
5. Start tracking and manage complaint / settlement actions from one dataset.

## Tracking Batch History (Workspace)
The Track Parcel page includes a `Tracking Batch History` table backed by database `TrackingJob` entries.

Each row shows:
- Batch ID
- Upload Date
- Total Tracking IDs
- Current Status
- Last Tracking Run
- Units Consumed

Supported row actions:
- `Run Tracking`: re-run tracking from saved batch source without re-upload
- `Download Master File`: download saved tracking master workbook for that batch
- `Complaints`: jump into complaint-focused view
- `Settlement`: jump into delivered/settlement-focused view
- `Delete Batch`: remove saved batch entry and source file from workspace history

## Retention Notice Requirement
Operators must follow the retention warning shown in the generation completion panel.

See: `docs/operations/tracking-retention-policy.md`

## File Expectations
- Accepted input types: `.csv`, `.xls`, `.xlsx`
- Preferred source: exported Tracking Master File from the completed label job.
- File detection badge indicates one of:
  - `tracking master file`
  - `shipment upload file`
  - `tracking-only file`
  - `unknown file`

## Blocking Validation
If no tracking IDs are detected in the uploaded file, tracking does not start.

Operator message:
`No tracking IDs found. Please upload exported Tracking Master File.`

## Tracking Master Columns
The exported workbook includes:
- Batch ID
- Generated Date
- Tracking ID
- Shipment Type
- Receiver Name
- Receiver Phone
- Receiver City
- Product
- Weight
- Collect Amount
- MO Amount
- MO Commission
- Gross Amount
- Current Status
- Complaint Status
- Settlement Status

## Status Defaults On Export
- Current Status: `BOOKED`
- Complaint Status: `NOT_RAISED`
- Settlement Status: `PENDING`
