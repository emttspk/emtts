# Complete Field Mapping Chain Audit — 2026-06-08

## AUDIT ONLY — NO CODE CHANGES

---

## Section 1: Label Generation File Chain

### Source of Truth: `OrderRecord` (orders.ts)

```
FILE:    apps/api/src/parse/orders.ts:8-28
TYPE:    OrderRecord
FIELDS:  shipperName, shipperPhone, shipperAddress, shipperEmail, senderCity,
         consigneeName, consigneeEmail, consigneePhone, consigneeAddress, receiverCity,
         CollectAmount, ordered, ProductDescription, Weight, shipmenttype, numberOfPieces,
         TrackingID
```

### Canonical Column Names vs Upload File Headers

```
FILE:    apps/api/src/parse/orders.ts:30-48
COLUMNS: strictColumns array (17 fields)
ALIASES: apps/api/src/parse/orders.ts:58-94
```

### Label Types and Which Fields They Render

**Box Label (default A4 — `labelsHtml`):**
```
FILE:   apps/api/src/templates/labels.ts:413-531
RENDERS:
  - shipperName (sender name)
  - shipperAddress (sender address)
  - senderCity (sender city)
  - consigneeName (receiver name)
  - consigneeAddress (receiver address)
  - receiverCity (receiver city)
  - consigneePhone (receiver phone)
  - ordered → "Order" card
  - Weight → "Weight" card (formatted as grams)
  - ProductDescription → "Product" card
  - CollectAmount → MO Amount / MO Commission / Gross Collect Amount
  - TrackingID → barcode + tracking number
  - shipmenttype → shipment type badge
  - numberOfPieces → NOT rendered on box label
  - shipperPhone → NOT rendered on box label
  - shipperEmail → NOT rendered on box label
  - consigneeEmail → NOT rendered on box label
```

**Envelope Label (`envelopeHtml`):**
```
FILE:   apps/api/src/templates/labels.ts:909-1015
RENDERS:
  - ordered → "{order_id}" token
  - ProductDescription → "{product_details}" token
  - Weight → NOT rendered on envelope
  - shipperName, shipperAddress, senderCity → sender block
  - consigneeName, consigneeAddress, receiverCity → receiver block
  - consigneePhone → receiver contact
  - CollectAmount → MO breakdown
  - TrackingID → barcode + tracking
```

**Flyer Label (`flyerHtml`):**
```
FILE:   apps/api/src/templates/labels.ts:728-807
RENDERS:
  - consigneeName → receiver name
  - consigneePhone → receiver phone
  - consigneeAddress → receiver address
  - receiverCity → receiver city
  - shipperName → sender name (footer)
  - Weight → NOT rendered on flyer
  - ordered → NOT rendered on flyer
```

---

## Section 2: Money Order File Chain

### Money Order Generator

```
FILE:    apps/api/src/templates/labels.ts:1017-1024
SOURCE:  OrderRecord → moneyOrderHtml → moneyOrderHtmlFromBenchmark
```

### Money Order Front Fields

```
FILE:    apps/api/src/templates/labels.ts:2075-2145
FUNCTION: frontFields(o: OrderRecord)
RENDERS:
  - mo_number → "MOS/UMO" number
  - barcodeValue / trackingNumber / TrackingID → VP tracking number
  - CollectAmount → amount display (via resolveMoneyOrderAmount)
  - issueDate → issue date
  - consigneeName → receiver name
  - consigneeAddress → receiver address
  - consigneePhone → receiver phone
  - shipperName → sender name
  - shipperAddress → sender address
  - shipperPhone → sender phone
  - shipperCnic → sender CNIC
```

### Fields NOT rendered on Money Order

| Field | Status |
|-------|--------|
| `ordered` / `order_id` | ❌ NOT on money order |
| `Weight` / `weight_gram` | ❌ NOT on money order |
| `ProductDescription` | ❌ NOT on money order |
| `numberOfPieces` | ❌ NOT on money order |
| `shipperEmail` | ❌ NOT on money order |
| `consigneeEmail` | ❌ NOT on money order |
| `senderCity` | ❌ NOT on money order |

### Money Order Back Fields

```
FILE:    apps/api/src/templates/labels.ts:2147-2150
FUNCTION: backFields(_o: OrderRecord)
RETURNS: "" (empty — back is static background image only)
```

---

## Section 3: Tracking Master File Chain

### Generator

```
FILE:    apps/api/src/worker/trackingMaster.ts:36-79
FUNCTION: buildTrackingMasterRows
```

### Tracking Master XLSX Columns (exact order)

```
FILE:    apps/api/src/worker.ts:1371-1389
HEADER:

  1. "Batch ID"         ← jobId
  2. "Generated Date"   ← new Date().toISOString().slice(0,10)
  3. "Tracking ID"      ← order.trackingNumber
  4. "MOS Number"       ← moneyOrderNumbers.join(", ")
  5. "Shipment Type"    ← resolved shipment type
  6. "Receiver Name"    ← consigneeName
  7. "Receiver Phone"   ← consigneePhone
  8. "Receiver City"    ← receiverCity
  9. "Product"          ← ProductDescription
 10. "Weight"           ← Weight (raw from OrderRecord)
 11. "Collect Amount"   ← CollectAmount / amount
 12. "MO Amount"        ← computed from moneyOrderBreakdown
 13. "MO Commission"    ← computed from moneyOrderBreakdown
 14. "Gross Amount"     ← computed from moneyOrderBreakdown
 15. "Current Status"   ← hardcoded "BOOKED"
 16. "Complaint Status" ← hardcoded "NOT_RAISED"
 17. "Settlement Status"← hardcoded "PENDING"
```

### Fields MISSING from Tracking Master

| Field | Present in OrderRecord | In Tracking Master? |
|-------|----------------------|--------------------|
| `ordered` / `order_id` | ✅ | ❌ |
| `shipperName` | ✅ | ❌ |
| `shipperPhone` | ✅ | ❌ |
| `shipperAddress` | ✅ | ❌ |
| `shipperEmail` | ✅ | ❌ |
| `senderCity` | ✅ | ❌ |
| `consigneeEmail` | ✅ | ❌ |
| `consigneeAddress` | ✅ | ❌ |
| `numberOfPieces` | ✅ | ❌ |
| `ProductDescription` | ✅ | ✅ (as "Product") |
| `Weight` | ✅ | ✅ (as "Weight") |

---

## Section 4: Sample Download File Chain

### Sample CSV

```
FILE:    apps/web/public/sample.csv
HEADERS: shipperName, shipperPhone, shipperAddress, shipperEmail, BookingCity,
         consigneeName, consigneeEmail, consigneePhone, consigneeAddress, ConsigneeCity,
         CollectAmount, order_id, ProductDescription, weight_gram, shipment_type,
         numberOfPieces, TrackingID
```

### Sample CSV → OrderRecord Mapping

| Sample CSV Header | Normalized | Maps To | In Strict Columns? |
|-------------------|-----------|---------|-------------------|
| `shipperName` | `shippername` | `shipperName` | ✅ |
| `shipperPhone` | `shipperphone` | `shipperPhone` | ✅ |
| `shipperAddress` | `shipperaddress` | `shipperAddress` | ✅ |
| `shipperEmail` | `shipperemail` | `shipperEmail` | ✅ |
| `BookingCity` | `bookingcity` | `senderCity` | ✅ (alias) |
| `consigneeName` | `consigneename` | `consigneeName` | ✅ |
| `consigneeEmail` | `consigneeemail` | `consigneeEmail` | ✅ |
| `consigneePhone` | `consigneephone` | `consigneePhone` | ✅ |
| `consigneeAddress` | `consigneeaddress` | `consigneeAddress` | ✅ |
| `ConsigneeCity` | `consigneecity` | `receiverCity` | ✅ (alias) |
| `CollectAmount` | `collectamount` | `CollectAmount` | ✅ |
| `order_id` | `orderid` | `ordered` | ✅ (alias) |
| `ProductDescription` | `productdescription` | `ProductDescription` | ✅ |
| `weight_gram` | `weightgram` | `Weight` | ✅ (alias) |
| `shipment_type` | `shipmenttype` | `shipmenttype` | ✅ (alias) |
| `numberOfPieces` | `numberofpieces` | `numberOfPieces` | ✅ |
| `TrackingID` | `trackingid` | `TrackingID` | ✅ |

### Sample CSV Header Normalization Detail

```
FILE:    apps/api/src/parse/orders.ts:96-98
FUNCTION: normalizeHeaderKey
PURPOSE:  Converts headers to lowercase and strips non-alphanumeric chars

"order_id"  → normalizeHeaderKey → "orderid"  → lookup → "ordered" ✅
"weight_gram" → normalizeHeaderKey → "weightgram" → lookup → "Weight" ✅
```

---

## Section 5: `orderid` / `ordered` Audit

### FIELD: `ordered`

| Location | Field Name | Status |
|----------|-----------|--------|
| OrderRecord type | `ordered` | ✅ Defined |
| strictColumns | `ordered` | ✅ Listed |
| strictColumnAliases | `ordered: ["orderid", "order_id", "reference", "referenceno"]` | ✅ |
| Sample CSV | `order_id` | ✅ Alias exists |
| Upload Validation | Via alias `order_id` → `ordered` | ✅ Validated |
| Database (Shipment) | ❌ **No field** | ⚠️ Missing |
| Database (LabelJob) | ❌ **No field** | ⚠️ Missing |
| Queue Job | ✅ Passed via OrderRecord | ✅ |
| Box Label | `ordered` rendered as "Order" | ✅ |
| Envelope Label | `ordered` rendered as "{order_id}" | ✅ |
| Flyer Label | ❌ NOT rendered | ⚠️ Missing |
| Money Order | ❌ NOT rendered | ⚠️ Missing |
| Tracking Master XLSX | ❌ NOT included | ⚠️ Missing |
| Tracking Workspace UI | ❌ Not displayed | ⚠️ Missing |
| API Shipment Response | ❌ Not returned | ⚠️ Missing |

### ISSUES FOR `orderid`

**ISSUE #1 — Database not storing `ordered`:**
```
FILE:    apps/api/prisma/schema.prisma:279-315
FIELD:   ordered
CURRENT: model Shipment has no `ordered` field
EFFECT:  order_id is lost after upload. Only available in the job's OrderRecord via JobDetail.
```

**ISSUE #2 — Tracking Master XLSX missing `ordered`:**
```
FILE:    apps/api/src/worker/trackingMaster.ts:59-77
FIELD:   ordered
CURRENT: Not included in Tracking Master columns (only has Product, Weight, but no Order ID)
```

**ISSUE #3 — Tracking Workspace UI missing `ordered`:**
```
FILE:    apps/web/src/pages/BulkTracking.tsx:4268-4290
FIELD:   ordered
CURRENT: Table shows Weight but NOT order_id
```

---

## Section 6: `Weight` Audit

### FIELD: `Weight`

| Location | Field Name | Status |
|----------|-----------|--------|
| OrderRecord type | `Weight` | ✅ Defined |
| strictColumns | `Weight` | ✅ Listed |
| strictColumnAliases | `Weight: ["weight", "weight(g)", "weight_gram", "parcelweight"]` | ✅ |
| Sample CSV | `weight_gram` | ✅ Alias exists |
| Upload Validation | Via alias `weight_gram` → `Weight` | ✅ Validated |
| Database (Shipment) | ❌ **No field** | ⚠️ Missing |
| Queue Job | ✅ Passed via OrderRecord | ✅ |
| Box Label | `Weight` formatted as grams via `formatWeightInGrams()` | ✅ |
| Envelope Label | ❌ **NOT rendered** | ⚠️ Missing |
| Flyer Label | ❌ **NOT rendered** | ⚠️ Missing |
| Money Order | ❌ **NOT rendered** | ⚠️ Missing |
| Tracking Master XLSX | ✅ Included as "Weight" | ✅ |
| Tracking Workspace UI | ✅ Displayed in table | ✅ |
| API Shipment Response | ❌ Not returned | ⚠️ Missing |

### ISSUES FOR `Weight`

**ISSUE #4 — Database not storing `Weight`:**
```
FILE:    apps/api/prisma/schema.prisma:279-315
FIELD:   Weight
CURRENT: model Shipment has no weight field
EFFECT:  Weight is lost from the database. Tracking workspace gets weight from parsed OrderRecord,
         not from the Shipment table.
```

**ISSUE #5 — Envelope label missing Weight:**
```
FILE:    apps/api/src/templates/labels.ts:970-1006
FIELD:   Weight
CURRENT: No {weight} token in envelope valueMap
```

**ISSUE #6 — Flyer label missing Weight:**
```
FILE:    apps/api/src/templates/labels.ts:728-807
FIELD:   Weight
CURRENT: Flyer template does not render weight
```

---

## Section 7: `Weight (grams)` Audit

### Weight Format Chain

**Formatting function:**
```
FILE:    apps/api/src/templates/labels.ts:59-69
FUNCTION: formatWeightInGrams(value: unknown)
BEHAVIOR:
  - Empty → ""
  - If contains "kg" → converts to grams: `${Math.round(numeric * 1000)} g`
  - Otherwise → `${Math.round(numeric)} g`
```

**Usage locations:**
- Box Label (line 440): `formatWeightInGrams(o.Weight)` ✅
- Tracking Master (line 69): `normalizeText((order as any).Weight)` — RAW value, not formatted ⚠️
- Tracking Workspace UI (line 4290): `fields.Weight || ""` — RAW value, not formatted ⚠️

### ISSUES FOR `Weight (grams)`

**ISSUE #7 — Inconsistent Weight formatting:**
```
FILE:    apps/api/src/templates/labels.ts:440     → formatWeightInGrams(o.Weight)   → "100 g"
FILE:    apps/api/src/worker/trackingMaster.ts:69 → normalizeText(order.Weight)     → "100" (raw)
FILE:    apps/web/src/pages/BulkTracking.tsx:4290  → fields.Weight                   → "100" (raw)
CURRENT: Box label formats weight as "100 g" but Tracking Master and Tracking Workspace show raw
         value without "g" suffix.
EXPECTED: Consistent weight display across all outputs.
```

**ISSUE #8 — Sample CSV uses `weight_gram` without unit suffix:**
```
FILE:    apps/web/public/sample.csv
CURRENT: Header is "weight_gram", values are "100", "30", "50", "250" (numeric grams)
EFFECT:  Users see raw numbers. Label appends "g". Tracking Master and Workspace show raw number.
```

---

## Section 8: Field Mismatch Report

### Mismatch 1 — Sample CSV vs Canonical Columns

```
HEADER:  Sample CSV has "BookingCity" but canonical column is "senderCity"
ALIAS:   "bookingcity" → "senderCity" (works via alias)
RISK:    Low — alias handles it
```

```
HEADER:  Sample CSV has "ConsigneeCity" but canonical column is "receiverCity"
ALIAS:   "consigneecity" → "receiverCity" (works via alias)
RISK:    Low — alias handles it
```

### Mismatch 2 — Case Inconsistency in Sample CSV

```
FIELD:   "CollectAmount" — PascalCase in OrderRecord
SAMPLE:  "CollectAmount" — same case ✅
BUT:     "shipment_type" — snake_case in sample, "shipmenttype" — lowercase in canonical
ALIAS:   "shipmenttype" → resolves via alias ✅
RISK:    Low
```

### Mismatch 3 — `senderCity` vs `BookingCity` in OrderRecord

```
OrderRecord: field is "senderCity"
StrictColumns: field is "senderCity"
Aliases: "sendercity", "bookingcity", "origincity"
Sample CSV uses: "BookingCity"
Label rendering: uses "senderCity" ✅
Envelope rendering: uses senderCity ✅
Tracking Master: does NOT include sender city ❌
Database: does NOT store sender city ❌
```

### Mismatch 4 — `receiverCity` vs `ConsigneeCity`

```
OrderRecord: field is "receiverCity"
StrictColumns: field is "receiverCity"
Aliases: "receivercity", "consigneecity", "destinationcity"
Sample CSV uses: "ConsigneeCity" (PascalCase)
Label rendering: uses "receiverCity" ✅
Tracking Master: uses "Receiver City" from "receiverCity" ✅
```

### Mismatch 5 — `numberOfPieces` Usage

```
OrderRecord: field is "numberOfPieces"
StrictColumns: ✅ included
Aliases: "numberofpieces", "pieces", "qty", "quantity"
Sample CSV: ✅ "numberOfPieces"
Label rendering: ❌ NOT on any label type
Tracking Master: ❌ NOT on tracking master
Database: ❌ NOT in Shipment table
```

### Mismatch 6 — `shipperEmail` / `consigneeEmail`

```
OrderRecord: ✅ both present
StrictColumns: ✅ both included
Sample CSV: ✅ both in sample
Label rendering: ❌ NOT on box, envelope, or flyer
Money Order: ❌ NOT on money order
Tracking Master: ❌ NOT on tracking master
Database: ❌ NOT in Shipment table
```

### Mismatch 7 — Database Schema Gaps

```
FILE:    apps/api/prisma/schema.prisma:279-315
MODEL:   Shipment

Fields stored:        trackingNumber, mosId, articleType, bookingOffice, deliveryOffice,
                      consigneeName, consigneeAddress, consigneePhone, lastScanDate,
                      currentStatus, returnReason, events, shipmentType, status, city,
                      latestDate, latestTime, daysPassed, complaintStatus, rawJson, adminCode

Fields NOT stored (from OrderRecord):
  - shipperName         ❌
  - shipperPhone        ❌
  - shipperAddress      ❌
  - shipperEmail        ❌
  - senderCity          ❌
  - consigneeEmail      ❌
  - receiverCity        ❌
  - CollectAmount       ❌
  - ordered / order_id  ❌ ** ISSUE **
  - ProductDescription  ❌
  - Weight              ❌ ** ISSUE **
  - numberOfPieces      ❌
```

---

## Section 9: Files That Must Change Later

### Label Generation

```
FILE: apps/web/public/sample.csv
CHANGE: Consider renaming "order_id" → "ordered" OR updating aliases for consistency.
        Consider adding a "Weight (kg)" alias or clarifying weight unit expectations.
```

### Tracking Master

```
FILE: apps/api/src/worker/trackingMaster.ts:59-77
CHANGE: Add "Order ID" / "Reference" column to Tracking Master export.
        Consider adding shipper name, sender city, and receiver city.
```

### Database Schema

```
FILE: apps/api/prisma/schema.prisma:279-315
CHANGE: Consider adding `orderId`, `weight`, `productDescription`, `collectAmount`,
        `shipperName`, `shipperPhone`, `shipperAddress`, `senderCity` to Shipment model
        for data persistence and query support.
```

### Tracking Workspace

```
FILE: apps/web/src/pages/BulkTracking.tsx:4268-4290
CHANGE: Consider adding "Order ID" column to the tracking workspace table.
```

### Weight Formatting Consistency

```
FILE: apps/api/src/templates/labels.ts:59-69 (formatWeightInGrams)
FILE: apps/api/src/worker/trackingMaster.ts:69 (Weight raw)
FILE: apps/web/src/pages/BulkTracking.tsx:4290 (Weight raw)
CHANGE: Apply consistent weight formatting across all outputs.
```

---

## Summary of All Issues

| # | Severity | Field | Description | File |
|---|----------|-------|-------------|------|
| 1 | High | `ordered` | Not stored in Shipment DB table | `schema.prisma:279-315` |
| 2 | High | `Weight` | Not stored in Shipment DB table | `schema.prisma:279-315` |
| 3 | Medium | `ordered` | Missing from Tracking Master XLSX | `trackingMaster.ts:59-77` |
| 4 | Medium | `ordered` | Missing from Tracking Workspace UI | `BulkTracking.tsx:4268-4290` |
| 5 | Medium | `Weight` | Missing from envelope label | `labels.ts:970-1006` |
| 6 | Medium | `Weight` | Missing from flyer label | `labels.ts:728-807` |
| 7 | Medium | `Weight` | Missing from money order | `labels.ts:2075-2145` |
| 8 | Low | `Weight` | Inconsistent formatting (label="100 g" vs master/workspace="100") | Multiple files |
| 9 | Low | `numberOfPieces` | Collected but never rendered anywhere | Multiple files |
| 10 | Low | `shipperEmail` | Collected but never rendered on any output | Multiple files |
| 11 | Low | `consigneeEmail` | Collected but never rendered on any output | Multiple files |
| 12 | Info | Sample CSV | Uses `order_id` and `weight_gram` (alias-mapped, working) | `sample.csv` |
| 13 | Info | Database gap | 12 OrderRecord fields not stored in Shipment table | `schema.prisma` |
