# Complaint Engine - Technical & Functional Documentation

## Table of Contents
1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Complaint Lifecycle](#3-complaint-lifecycle)
4. [Data Flow](#4-data-flow)
5. [API Integration](#5-api-integration)
6. [Error Handling](#6-error-handling)
7. [Selenium Automation](#7-selenium-automation)
8. [Database Schema](#8-database-schema)
9. [Response Handling](#9-response-handling)
10. [Duplicate Detection](#10-duplicate-detection)
11. [Audit Logging](#11-audit-logging)
12. [UI Binding Layer](#12-ui-binding-layer)
13. [Consignee Rendering Logic](#13-consignee-rendering-logic)
14. [Delivery Office Resolution Logic](#14-delivery-office-resolution-logic)
15. [Complaint Form Validation Rules](#15-complaint-form-validation-rules)
16. [Automation Sync Rule](#16-automation-sync-rule)
17. [Logging Standard](#17-logging-standard)

---

## 1. Overview

The Complaint Engine is a full-stack system for automated complaint filing against missing shipments on Pakistan Post's website. It handles:
- Tracking data extraction and normalization
- Complaint form population and submission
- Location hierarchy mapping (District → Tehsil → Location)
- Duplicate complaint detection
- Consignee information fallback and rendering
- Comprehensive audit logging

**Current Date**: April 11, 2026

---

## 2. Architecture

### Components
- **Backend (API)**: Node.js/TypeScript with Prisma ORM  
- **Frontend (Web)**: React + TypeScript + Tailwind CSS  
- **Automation**: Selenium WebDriver with Chromium  
- **Tracking Service**: Python (FastAPI/Uvicorn) for Pakistan Post integration  
- **Database**: SQLite (Prisma)

### Key Modules

#### Backend
- `apps/api/src/index.ts` - Express server, request routing
- `apps/api/src/config.ts` - Configuration management
- `apps/api/src/prisma.ts` - Database client
- `apps/api/src/worker.ts` - Job queue / cron handler
- `apps/api/src/auth/` - Authentication layer
- `apps/api/src/middleware/` - Request/response middleware
- `apps/api/src/routes/` - API endpoints

#### Frontend
- `apps/web/src/pages/BulkTracking.tsx` - Main complaint form and tracking UI
- `apps/web/src/components/` - Reusable React components
- Complaint modal, form fields, location selector

#### Python Service
- `tracking_interpreter.py` - Parses Pakistan Post HTML responses
- `status_engine.py` - Extracts status and events from tracking data
- `complaint_engine.py` - Fills and submits complaints via Selenium

---

## 3. Complaint Lifecycle

### State Transitions
```
PENDING → [Auto-detect] → complaint_active?
  ├─ YES (ACTIVE) → Show complaint details, do not allow new complaint
  └─ NO (PENDING) → Allow complaint submission
                      ↓
                   Form Submission
                      ↓
                   [Live Selenium]
                      ↓
                   SUCCESS / DUPLICATE / FAILED
                      ↓
                   [Store in Database]
                      ↓
                   [Refresh Tracking View]
```

### Complaint Status Values
- `PENDING` - Shipment not yet complained
- `ACTIVE` - Complaint already filed (in process)
- `RESOLVED` - Complaint closed
- `DUPLICATE` - Complaint attempt returned duplicate ID
- `FAILED` - Complaint submission error

---

## 4. Data Flow

### Flow Diagram
```
Pakistan Post Website
        ↓
  [Selenium/HTTP Fetch]
        ↓
   Raw HTML Response
        ↓
  [Tracking Parser]
        ↓
  Structured JSON {
    Article No, Booking Date,
    Sender Name/City, Receiver Name/City,
    Events (Timeline), Status
  }
        ↓
  [Unified Fields Extraction]
        ↓
  getUnifiedFields() {
    shipperName, shipperAddress,
    consigneeName, consigneeAddress,
    senderCity, receiverCity
  }
        ↓
  [Complaint Form Population]
        ↓
  Form State Variables {
    senderNameInput, receiverNameInput,
    senderCityValue, receiverCityValue,
    selectedDistrict, selectedTehsil, selectedLocation,
    complaintText, complaintPhone
  }
        ↓
  [Submit to Backend]
        ↓
  [Selenium: Fill Form → Submit]
        ↓
  [Parse Response]
        ↓
  Complaint ID / Error
        ↓
  [Store & Display]
```

---

## 5. API Integration

### Endpoints

#### GET `/api/tracking/{trackingId}`
Fetches a single tracking record with full history.

**Response**:
```typescript
{
  trackingNumber: string;
  rawJson: string;           // Raw Pakistan Post HTML JSON
  final_status: string;      // PENDING | DELIVERED | etc
  shipment: {
    trackingNumber: string;
    sender_name: string;
    receiver_name: string;
    booking_date: string;    // DD/MM/YYYY
  };
}
```

#### GET `/api/tracking/complaint/prefill/{trackingId}`
Pre-fills complaint form with location hierarchy.

**Response**:
```typescript
{
  deliveryOffice: string;    // Post office name
  matched: {
    district: string;
    tehsil: string;
    location: string;
  } | null;
  districtData: [{
    district: string;
    tehsil: string;
    location: string;
  }];
  locations: string[];       // City dropdown options
}
```

#### POST `/api/tracking/complaint`
Submits complaint form data and triggers Selenium automation.

**Request Body**:
```typescript
{
  tracking_number: string;
  phone: string;             // 03XXXXXXXXX format
  complaint_text: string;
  sender_name: string;
  sender_address: string;
  sender_city_value: string;
  receiver_name: string;
  receiver_address: string;
  receiver_city_value: string;
  booking_office: string;
  complaint_reason: string;  // "Pending Delivery"
  prefer_reply_mode: string; // "POST" | "EMAIL"
  reply_email?: string;
  service_type: string;      // "VPL" | "MO"
  recipient_district: string;
  recipient_tehsil: string;
  recipient_location: string;
}
```

**Response**:
```typescript
{
  success: boolean;
  complaint_id?: string;
  due_date?: string;
  tracking_id?: string;
  status?: string;           // "FILED" | "DUPLICATE" | "ERROR"
  message?: string;
}
```

---

## 6. Error Handling

### Complaint Submission Errors
1. **Missing Required Field** → Alert user, highlight field
2. **Invalid Mobile** → Show format "03XXXXXXXXX"
3. **Already Active** → Show existing complaint ID + due date
4. **Location Not Selected** → Enable manual selection
5. **Selenium Timeout** → Log and return "FAILED"
6. **Duplicate Detection** → Accept and return complaint_id

### Retry Logic
- Backend automatically retries failed submissions (up to 3 times)
- Python service queues failed complaints for later retry
- Cron job runs nightly to retry queued complaints

---

## 7. Selenium Automation

### Process Flow
1. **Initialize Driver**
   - Headless Chromium with Pakistan Post proxy if needed
   - 30s default timeout per operation

2. **Navigate & Fill Form**
   - Open complaint form URL
   - Verify booking date validation (age check)
   - Fill fields from request payload:
     - sender_name, sender_address, sender_city_value
     - receiver_name, receiver_address, receiver_city_value
     - recipient_district, recipient_tehsil, recipient_location
     - complaintText, phone

3. **Select Location**
   - Click district dropdown, select by text value
   - Wait for tehsil CASCADE
   - click tehsil dropdown, select by text value
   - Wait for location CASCADE
   - Click location dropdown, select by text value
   - Verify "locked" badge appears

4. **Submit & Parse**
   - Click submit button
   - Parse response for:
     - "success" / "duplicate" / "error" in response text
     - Complaint ID from response page
     - Due date from response page

---

## 8. Database Schema

### Complaint Table
```prisma
model Complaint {
  id String @id @default(cuid())
  
  // Reference
  trackingId String @unique
  
  // Submission Data
  phone String
  complaintText String
  complaintReason String
  
  // Consignee Info (as stored in form)
  senderName String
  senderAddress String
  senderCity String
  receiverName String
  receiverAddress String
  receiverCity String
  
  // Location Hierarchy
  district String
  tehsil String
  location String
  
  // Response
  complaintId String?        // Issued by Pakistan Post
  dueDate DateTime?
  status String              // FILED | DUPLICATE | ERROR | ACTIVE
  responsePayload String?
  
  // Meta
  createdAt DateTime @default(now())
  submittedAt DateTime?
  resolvedAt DateTime?
  
  @@index([trackingId])
  @@index([status])
}
```

---

## 9. Response Handling

### Pakistan Post Response Parsing
The Selenium script waits for and parses:
- `"submitted successfully"` → status = "FILED"
- `"already under process"` → status = "DUPLICATE" (extract ID)
- Any error → status = "ERROR"

**Complaint ID Extraction**:
```javascript
// From response page, find text like:
// "Complaint ID: 123456" or "Receipt #: 123456"
const idMatch = responseBody.match(/(?:Complaint ID|Receipt #)[:\s#]+(\w+)/i);
const complaintId = idMatch ? idMatch[1] : null;
```

---

## 10. Duplicate Detection

### Strategy
1. **Database Check**: Query `Complaint` table for `trackingId`
   - If exists and `status = "ACTIVE"` → Block new submission, show existing detail
2. **Backend Check**: Call Pakistan Post API (if available)
3. **Response Parsing**: Accept "already under process" as valid duplicate

### Duplicate Response Handling
```typescript
if (/already under process/i.test(response.message)) {
  // Extract existing complaint ID from response
  // Return status = "DUPLICATE" with complaint_id
  // DO NOT re-submit
}
```

---

## 11. Audit Logging

### Standard Log Format (Per Attempt)
```typescript
{
  timestamp: ISO8601,
  stage: "COMPLAINT_SUBMISSION_ATTEMPT",
  tracking_id: string,
  form_data: {
    sender_name: string,
    sender_address: string,
    sender_city: string,
    receiver_name: string,
    receiver_address: string,
    receiver_city: string,
    district: string,
    tehsil: string,
    location: string,
    phone: string,
    complaint_text: string
  },
  delivery_office: string,     // Extracted from events
  event_based_office: string,  // Last tracking event location
  mapped_location: {
    district: string,
    tehsil: string,
    location: string,
    auto_matched: boolean
  },
  consignee_rendered: boolean,
  receiver_name_source: "raw" | "fallback_addressee",
  receiver_address_source: "raw" | "delivery_office" | "event_based" | "fallback_pakistan",
  
  // Submission Result
  submission_status: "SUCCESS" | "DUPLICATE" | "FAILED",
  complaint_id: string | null,
  due_date: string | null,
  error_reason: string | null,
  
  // Selenium Details
  selenium_status: "success" | "timeout" | "network_error",
  selenium_duration_ms: number,
  
  // Response
  response_code: number,
  response_message: string
}
```

---

## 12. UI Binding Layer

### Source of Truth
**The complaint form (frontend) is the single source of truth.**
- Backend does NOT override form data
- All values come from tracked shipment metadata
- User edits are preserved through submission
- No post-submission recomputation of fields

### Data Flow: View Page → Complaint Form

```
Tracking View Page
    ↓
  [User clicks "File Complaint"]
    ↓
  openComplaintModal()
    └─ Extract raw JSON from shipment
    └─ Parse sender/receiver from tracking
    └─ Call getUnifiedFields() for fallbacks
    └─ Apply _cleanDash() to remove "-" values
    └─ Set form state:
       - setSenderNameInput(senderName)
       - setReceiverNameInput(receiverName)     [ALWAYS has value: "Addressee" or raw]
       - setReceiverAddressInput(receiverAddress) [ALWAYS has value: delivery office or "Pakistan"]
       - setSenderCityValue(bookingCity)
       - setReceiverCityValue(deliveryOffice or eventBasedDeliveryOffice)
    ↓
  [Complaint Form Modal Opens]
    ├─ Addressee section (locked if auto-filled)
    ├─ Location hierarchy selector (district → tehsil → location)
    ├─ City dropdowns (sender/receiver)
    ├─ Complaint text (pre-filled template)
    └─ Phone + reply mode
    ↓
  [User Reviews & Confirms]
    ↓
  submitComplaintInstant()
    └─ Validate all fields
    └─ Build requestPayload from form state (NOT from raw JSON again)
    └─ POST to /api/tracking/complaint
    ↓
  [API Receives Payload]
    └─ NO recomputation of sender/receiver
    └─ DIRECT submission to Selenium
    ↓
  [Selenium Fills Pakistan Post Form]
    └─ Uses exact payload values
    └─ No backend transformation
```

### Binding Rules
- **Binding Target**: All form inputs bind to `useState` variables
- **Binding Direction**: One-way: form state → display (reads)
- **User Edits**: Update state directly, reflected immediately
- **Submission**: Read from state, send to backend
- **Locked Fields**: Read-only UI, state updated only during init

### Locked Field Binding
```typescript
// Receiver Name (ALWAYS locked after init)
const receiverNameIsLocked = _hasValue(receiverNameInput);
<input
  value={receiverNameInput}
  disabled={receiverNameIsLocked}
  className={receiverNameIsLocked ? "bg-slate-100 cursor-not-allowed" : ""}
/>
<div className="text-xs text-slate-500">
  Auto-filled from tracking or system fallback · cannot be edited
</div>
```

---

## 13. Consignee Rendering Logic

### Consignee Determination

#### Source Priority
1. Raw tracking data: `receiver_name`, `consignee_name`
2. If empty → Fallback: `"Addressee"`
3. If raw contains "-" → Treat as empty, use fallback

```typescript
const rawReceiverName = String(raw?.receiver_name ?? raw?.receiverName ?? "").trim();
const receiverName = _cleanDash(rawReceiverName) || "Addressee";  // Always has value
```

#### Address Determination

**Source Priority** (in order):
1. Raw: `receiver_address`, `consignee_address`
2. Delivery office (post office name from tracking)
3. Event-based delivery office (LAST tracking event location)
4. DMO (delivery management office)
5. Upload consignee city
6. Booking city
7. Fallback: `"Pakistan"`

```typescript
const deliveryOffice = String(raw?.resolved_delivery_office || raw?.delivery_office || "").trim();
const events = (raw?.tracking as any)?.events ?? [];
const lastEvent = events.length > 0 ? events[events.length - 1] : null;
const eventBasedDeliveryOffice = String(lastEvent?.location || lastEvent?.city || "").trim();

const receiverAddress = 
  rawReceiverAddress || 
  deliveryOffice || 
  eventBasedDeliveryOffice ||  // NEW: Event extraction
  deliveryDmo || 
  uploadConsigneeCity || 
  bookingCity || 
  "Pakistan";  // Absolute fallback
```

### Rendering Locations

#### 1. View Page (Tracking Details)
**Display Rule**: Render if available, otherwise show fallback

```tsx
<div className="text-sm">
  <span className="font-semibold">Addressee:</span> {receiverName || "Addressee"}
  <div className="text-xs text-slate-500">
    {receiverAddress || "Delivery Office: [Unknown]"}
  </div>
</div>
```

#### 2. Complaint Form Modal

**MANDATORY**: Always render consignee fields in form

```tsx
// In complaint form:
<fieldset>
  <legend>Addressee Information</legend>
  
  <div>
    <label>Name:</label>
    <input
      value={receiverNameInput}
      disabled={receiverNameIsLocked}
      placeholder="Addressee"
      // LOCKED with badge if auto-filled
    />
    {receiverNameIsLocked && (
      <span className="badge">Auto-filled · cannot edit</span>
    )}
  </div>
  
  <div>
    <label>Address:</label>
    <input
      value={receiverAddressInput}
      disabled={receiverAddressIsLocked}
      placeholder="Delivery Post Office"
      // LOCKED with badge if auto-filled
    />
    {receiverAddressIsLocked && (
      <span className="badge">Auto-filled from tracking · cannot edit</span>
    )}
  </div>
  
  <div>
    <label>Contact Number:</label>
    <input
      value={complaintPhone}
      placeholder="Your mobile number (03XXXXXXXXX)"
      // User must enter (NOT locked)
    />
  </div>
</fieldset>
```

### Validation for Consignee

Before form submission:
```typescript
if (!receiverNameInput.trim() || receiverNameInput === "-") {
  alert("Receiver name is required.");
  return false;
}
if (!receiverAddressInput.trim() || receiverAddressInput === "-") {
  alert("Receiver address is required.");
  return false;
}
```

**Result**: Submission BLOCKED if consignee incomplete

---

## 14. Delivery Office Resolution Logic

### Extraction Logic

#### Step 1: Identify Delivery Office Sources
```typescript
// From raw JSON fields
const deliveryOffice = String(raw?.resolved_delivery_office || raw?.delivery_office || "").trim();
const deliveryDmo = String(raw?.delivery_dmo || "").trim();
const uploadConsigneeCity = String(raw?.receiver_city || "").trim();

// From tracking events (NEW)
const events = (raw?.tracking as any)?.events ?? [];
const lastEvent = events.length > 0 ? events[events.length - 1] : null;
const eventBasedDeliveryOffice = String(lastEvent?.location || lastEvent?.city || "").trim();

// Priority order:
// 1. deliveryOffice (if provided by API)
// 2. eventBasedDeliveryOffice (from last tracking event)
// 3. deliveryDmo
// 4. uploadConsigneeCity
```

#### Step 2: Normalize Values
```typescript
const _cleanDash = (v: string) => {
  const t = v.trim();
  return (t === "-" || t === "") ? "" : t;
};

const normalizedDeliveryOffice = _cleanDash(deliveryOffice);
const normalizedEventBased = _cleanDash(eventBasedDeliveryOffice);
```

#### Step 3: Map to Hierarchy
```typescript
// Phase 1: API prefill (server-side matching)
prefill = await fetchPrefill(trackingId);
if (prefill.matched) {
  // Server already matched delivery office to district/tehsil/location
  districtsData = prefill.districtData;
  selectedDistrict = prefill.matched.district;
  selectedTehsil = prefill.matched.tehsil;
  selectedLocation = prefill.matched.location;
  setComplaintSelectionLocked(true);  // Lock UI
} else {
  // Phase 2: Client-side fallback search
  const candidates = [
    deliveryOffice,
    eventBasedDeliveryOffice,
    prefill.deliveryOffice,
    deliveryDmo,
    uploadConsigneeCity
  ].filter(v => v && v.trim() !== "");
  
  for (const candidate of candidates) {
    const rows = searchOfficeRows(candidate, prefill.districtData);
    if (rows.length > 0) {
      selectedDistrict = rows[0].district;
      selectedTehsil = rows[0].tehsil;
      selectedLocation = rows[0].location;
      setComplaintSelectionLocked(true);
      break;
    }
  }
}
```

### Fallback Behavior

#### Case 1: Delivery Office Auto-Matched
- District/Tehsil/Location populated
- "Locked" badge shown
- User cannot edit (UI disabled)
- ✅ Form ready for submission

#### Case 2: No Match Found
- District/Tehsil/Location empty
- Selection unlocked, red validation state
- "Please select recipient city" shown
- ❌ Form BLOCKED until user selects

#### Case 3: Partial Match
- District matched, Tehsil/Location empty
- User must complete hierarchy
- Validation enforces all 3 fields (district, tehsil, location)
- ❌ Form BLOCKED until complete

---

## 15. Complaint Form Validation Rules

### Valid Field States
- **No "-" values**: "-" is treated as empty (using `_cleanDash()`)
- **No empty strings**: All required fields must have `.trim() !== ""`
- **Location hierarchy**: ALL three (district, tehsil, location) must be selected
- **Phones**: Format `03XXXXXXXXX` (11 digits, starts with 03)

### Validation Sequence

```typescript
function validateComplaintFields(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // Article No
  if (!complaintRecord?.shipment.trackingNumber.trim()) 
    missing.push("ArticleNo");
  
  // Sender
  const sName = senderNameInput.trim();
  if (!sName || sName === "-") 
    missing.push("Sender Name");
  
  // Receiver
  const rName = receiverNameInput.trim();
  if (!rName || rName === "-") 
    missing.push("Receiver Name");
  
  // Cities
  if (!senderCityValue.trim()) 
    missing.push("Sender City");
  if (!receiverCityValue.trim()) 
    missing.push("Receiver City");
  
  // Mobile
  const normalized = normalizePkMobile(complaintPhone.trim());
  if (!normalized) 
    missing.push("Mobile");
  
  // Complaint Text
  if (!complaintText.trim()) 
    missing.push("Remarks");
  
  // Location Hierarchy (ALL three required)
  if (!selectedDistrict.trim()) 
    missing.push("District");
  if (!selectedTehsil.trim()) 
    missing.push("Tehsil");
  if (!selectedLocation.trim()) 
    missing.push("Location");
  
  return { valid: missing.length === 0, missing };
}
```

### Submission Validation (Pre-Submit)

```typescript
async function submitComplaintInstant() {
  // Check each field individually with specific alert
  if (!senderNameInput.trim()) {
    alert("Sender name is required.");
    return;
  }
  if (!receiverNameInput.trim()) {
    alert("Receiver name is required.");
    return;
  }
  if (!receiverAddressInput.trim()) {
    alert("Receiver address is required.");
    return;
  }
  if (!senderCitySelected) {
    alert("Sender city is required.");
    return;
  }
  if (!receiverCitySelected) {
    alert("Receiver city is required.");
    return;
  }
  if (!complaintLocationSelected) {  // Are district/tehsil/location all selected?
    alert("Location selection is required before submit.");
    return;
  }
  const cityValue = String(selectedDistrict || selectedLocation || "").trim().toUpperCase();
  if (!cityValue) {
    alert("Please select recipient city from dropdown.");
    return;
  }
  if (complaintTextRequired) {
    alert("Complaint text is required");
    return;
  }
  
  // All valid, proceed with submission
}
```

### UI Validation States
- **Valid**: Green check, field enabled
- **Invalid**: Red border, alert text, field highlighted
- **Locked**: Gray background, read-only, "cannot edit" label
- **Required**: Bold label, red asterisk

---

## 16. Automation Sync Rule

### Principle
**Complaint form data = Exact Selenium payload. No recomputation allowed after form submission.**

### Strict Enforcement

#### 1. Form → Request Payload
```typescript
// In submitComplaintInstant():

// Use DIRECT form state, NEVER re-extract from raw JSON
const requestPayload = {
  tracking_number: complaintRecord.shipment.trackingNumber,
  phone: normalizedPhone,
  complaint_text: complaintText.trim(),           // From form state
  sender_name: senderNameInput.trim(),            // From form state
  sender_address: senderAddressInput.trim(),      // From form state
  sender_city_value: senderCityExact,             // From form state ← matched from dropdown
  receiver_name: receiverNameInput.trim(),        // From form state
  receiver_address: receiverAddressInput.trim(),  // From form state
  receiver_city_value: receiverCityExact,         // From form state ← matched from dropdown
  booking_office: bookingOfficeValue,             // From form state
  complaint_reason: complaintReason,              // From form state
  prefer_reply_mode: replyMode,                   // From form state
  reply_email: complaintEmail.trim() || undefined,// From form state
  service_type: serviceType,                      // From form state
  recipient_district: selectedDistrict,           // From form state
  recipient_tehsil: selectedTehsil,               // From form state
  recipient_location: selectedLocation            // From form state
};

// FORBIDDEN: Recomputing fields from raw JSON
// ❌ DO NOT: const newSenderName = reExtractSenderName(raw);
// ❌ DO NOT: const newDistrict = rematchDistrict(deliveryOffice);
```

#### 2. Request Payload → Selenium
```python
# In complaint_engine.py:

# Use exact values from request payload
driver.fill_field("SenderName", payload["sender_name"])        # NO transformation
driver.fill_field("ReceiverName", payload["receiver_name"])    # NO transformation
driver.select_dropdown("District", payload["recipient_district"])   # Exact text match
driver.select_dropdown("Tehsil", payload["recipient_tehsil"])       # Exact text match
driver.select_dropdown("Location", payload["recipient_location"])   # Exact text match

# FORBIDDEN: Backend-side transformation
# ❌ DO NOT: normalizeDistrictName(payload["recipient_district"])
# ❌ DO NOT: lookupTehsilValue(payload["recipient_district"], payload["recipient_tehsil"])
```

#### 3. Payload Guarantees
```typescript
// recipient_district, recipient_tehsil, recipient_location
// are ALWAYS sent as strings (never undefined):
recipient_district: selectedDistrict || "",      // Empty string if not selected
recipient_tehsil: selectedTehsil || "",          // Empty string if not selected
recipient_location: selectedLocation || "",      // Empty string if not selected

// BUT: Validation prevents submission if these are empty
// So actual payload will always have values
```

---

## 17. Logging Standard

### Per-Complaint Attempt Log Structure

#### Head Section
```json
{
  "timestamp": "2026-04-11T14:30:45.123Z",
  "event": "COMPLAINT_SUBMISSION_ATTEMPT",
  "tracking_id": "VPL26030761",
  "request_id": "req-abc123",
  "user_agent": "Mozilla/5.0..."
}
```

#### Form Data Section
```json
{
  "form_data": {
    "sender_name": "Hoja Seeds",
    "sender_address": "Sahiwal",
    "sender_city_value": "57",
    "receiver_name": "Addressee",
    "receiver_address": "Latember",
    "receiver_city_value": "1",
    "complaint_text": "I respectfully request...",
    "complaint_reason": "Pending Delivery",
    "mobile": "03354299783",
    "email": null,
    "reply_mode": "POST"
  }
}
```

#### Data Source Section
```json
{
  "data_sources": {
    "receiver_name": {
      "value": "Addressee",
      "source": "fallback",
      "reason": "raw_receiver_name_missing_or_empty"
    },
    "receiver_address": {
      "value": "Latember",
      "source": "event_based_delivery_office",
      "extraction_method": "last_tracking_event_location",
      "fallback_chain": ["raw_address", "delivery_office", "event_based", "dmo", "city", "booking_city", "pakistan"]
    },
    "delivery_office": {
      "raw": "Latember",
      "event_based": "Latember",
      "dmo": null,
      "upload_city": null
    }
  }
}
```

#### Location Mapping Section
```json
{
  "location_hierarchy": {
    "selected": {
      "district": "1018",
      "district_name": "Okara",
      "tehsil": "1089",
      "tehsil_name": "Renala Khurd",
      "location": "1203",
      "location_name": "Latember"
    },
    "mapping_method": "api_prefill_matched",
    "was_locked": true,
    "user_modified": false,
    "candidates_tried": ["Latember", "Latember"]
  }
}
```

#### Consignee Rendering Section
```json
{
  "consignee_rendering": {
    "view_page_rendered": true,
    "form_field_rendered": true,
    "receiver_name_locked": true,
    "receiver_address_locked": true,
    "receiver_name_visible": "Addressee",
    "receiver_address_visible": "Latember"
  }
}
```

#### Submission Details Section
```json
{
  "submission": {
    "form_validation": {
      "passed": true,
      "missing_fields": [],
      "validation_duration_ms": 45
    },
    "payload_size_bytes": 1247,
    "payload_structure_valid": true
  }
}
```

#### Selenium Execution Section
```json
{
  "selenium_execution": {
    "status": "success",
    "driver_type": "chromium",
    "start_time": "2026-04-11T14:30:45.500Z",
    "end_time": "2026-04-11T14:31:02.750Z",
    "duration_ms": 17250,
    "operations": [
      {
        "operation": "navigate",
        "target": "complaint_form_url",
        "duration_ms": 3500,
        "status": "success"
      },
      {
        "operation": "fill_field",
        "field": "sender_name",
        "value": "Hoja Seeds",
        "duration_ms": 250,
        "status": "success"
      },
      {
        "operation": "select_dropdown",
        "field": "district",
        "value": "Okara",
        "duration_ms": 800,
        "status": "success",
        "cascade_triggered": true
      },
      {
        "operation": "select_dropdown",
        "field": "tehsil",
        "value": "Renala Khurd",
        "duration_ms": 600,
        "status": "success",
        "cascade_triggered": true
      },
      {
        "operation": "select_dropdown",
        "field": "location",
        "value": "Latember",
        "duration_ms": 500,
        "status": "success"
      },
      {
        "operation": "submit_form",
        "duration_ms": 2500,
        "status": "success"
      }
    ],
    "network_errors": [],
    "element_not_found_errors": [],
    "timeout_errors": []
  }
}
```

#### Response Section
```json
{
  "response": {
    "status_code": 200,
    "response_type": "success",
    "complaint_id": "123456",
    "due_date": "2026-04-18",
    "message": "Complaint submitted successfully",
    "response_html_size_bytes": 5420,
    "parse_method": "regex_extraction"
  }
}
```

#### Final Result Section
```json
{
  "result": {
    "submission_status": "SUCCESS",
    "complaint_id": "123456",
    "due_date": "2026-04-18",
    "stored_in_db": true,
    "db_record_id": "clp-xyz789",
    "database_write_duration_ms": 120
  }
}
```

#### Error Section (If Applicable)
```json
{
  "error": {
    "error_type": "VALIDATION_ERROR | NETWORK_ERROR | PARSE_ERROR | SELENIUM_TIMEOUT | DUPLICATE",
    "error_message": "...",
    "error_code": "ERR_LOCATION_NOT_SELECTED",
    "field_involved": "recipient_location",
    "recovery_action": "enable_manual_selection"
  }
}
```

---

## Summary

This complaint engine provides:
✅ **Complete data flow** from tracking extraction to complaint filing
✅ **Consignee rendering** with fallback logic (Addressee/Pakistan)
✅ **Delivery office resolution** from events and hierarchical matching
✅ **Form validation** preventing incomplete submissions
✅ **Automation sync** ensuring backend uses exact form data
✅ **Comprehensive logging** for audit and debugging

**Current Implementation Status**: ✅ Complete & Ready for Testing
