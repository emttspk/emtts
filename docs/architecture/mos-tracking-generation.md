# MOS and Tracking ID Generation Logic

This document details the exact generation logic for Money Order Series (MOS) numbers and Virtual Parcel Locator (VPL) Tracking IDs in the ePost system.

## A. Money Order Series (MOS) Generation

### Overview
Money Order Series (MOS) numbers are unique identifiers assigned to each money order generated in the system. They prevent duplicates and ensure sequential tracking of financial transactions.

### Generation Format
```
MOS05040001
├─ MOS    = Prefix (MONEY_ORDER_PREFIX)
├─ 05     = Month (01-12, zero-padded)
└─ 040001 = Sequence (6-7 digits, zero-padded for overflow)
```

### Detailed Logic

**File:** `apps/api/src/validation/trackingId.ts`

**Constants:**
```typescript
export const MONEY_ORDER_PREFIX = "MOS";           // Standard shipments (VPL, VPP)
export const MONEY_ORDER_PREFIX_COD = "UMO";       // Cash-on-Delivery shipments
export const MONEY_ORDER_SPLIT_LIMIT = 20_000;     // Max orders before split into multiple MOS sequences
```

**Validation Pattern:**
```typescript
const moneyOrderNumberPattern = /^(MOS|UMO)(0[1-9]|1[0-2])\d{6,7}$/;
// Matches: MOS + Month(01-12) + Sequence(6-7 digits)
```

**Generation Function:**
```typescript
export function buildMoneyOrderNumber(sequence: number, value?: string | Date, shipmentType?: unknown) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error("Money order sequence must be a positive integer.");
  }
  const normalizedType = String(shipmentType ?? "").trim().toUpperCase();
  const prefix = normalizedType === "COD" ? MONEY_ORDER_PREFIX_COD : MONEY_ORDER_PREFIX;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const width = sequence > 999_999 ? 7 : 6;  // Use 7 digits for sequences > 999,999
  return `${prefix}${month}${String(sequence).padStart(width, "0")}`;
}
```

### Allocation Flow

**File:** `apps/api/src/worker.ts`

**Function:** `allocateNextMoneyOrderNumber()`

**Steps:**

1. **Advisory Lock** - Acquire database-level advisory transaction lock per issue date:
   ```sql
   SELECT pg_advisory_xact_lock(hashtext(${moneyOrderLockKey(issueDate, shipmentType)}))
   ```
   - Lock key format: `{PREFIX}:{DATE}` (e.g., `MOS:2026-05-10`)
   - Prevents concurrent allocation race conditions

2. **Retrieve Latest** - Query for highest MOS number with matching month/prefix:
   ```sql
   SELECT mo_number
   FROM money_orders
   WHERE mo_number LIKE ${latestPrefix}  -- Matches "MOS05%"
   ORDER BY LENGTH(mo_number) DESC, mo_number DESC
   LIMIT 1
   ```

3. **Parse Sequence** - Extract sequence number from latest MOS:
   ```typescript
   const latestSequence = latestMoStr.length >= 6 ? Number.parseInt(latestMoStr.slice(5), 10) : null;
   if (latestSequence && latestSequence > 0) {
     sequence = latestSequence + 1;
   }
   ```

4. **Collision Prevention Loop** - Verify uniqueness and handle duplicates:
   ```typescript
   while (true) {
     const moNumber = buildMoneyOrderNumber(sequence, issueDate, shipmentType);
     const exists = await executor.$queryRaw`
       SELECT 1::int AS exists
       FROM money_orders
       WHERE mo_number = ${moNumber}
       LIMIT 1
     `;
     if (!reservedNumbers.has(moNumber) && exists.length === 0) {
       reservedNumbers.add(moNumber);
       return moNumber;
     }
     sequence += 1;  // Skip duplicate, try next
   }
   ```

5. **Reserve** - Add allocated MOS to `reservedNumbers` Set to prevent re-allocation in same batch

### Database Table
**Table:** `money_orders`

**Key Fields:**
- `mo_number` (STRING, UNIQUE): The allocated MOS (e.g., "MOS05040001")
- `issue_date` (DATE): Issue date for the MOS
- `tracking_number` (STRING, FK): Associated tracking ID (VPL)
- `amount` (DECIMAL): Amount collected
- `mo_amount` (DECIMAL): Commission-adjusted amount
- `commission` (DECIMAL): Processing fee
- `gross_amount` (DECIMAL): Total value

### Reissue/Re-generation Behavior
- **Initial Generation:** Allocated during `ensureSystemMoneyOrders()` if not provided in CSV
- **Reissue:** Once issued, MOS is persisted in `money_orders` table and never regenerated for same tracking ID
- **Manual Override:** User can provide MOS in CSV, must satisfy validation pattern

---

## B. Tracking ID (VPL) Generation

### Overview
Tracking IDs (Virtual Parcel Locator, prefix VPL) are unique identifiers for shipments. They enable public tracking of parcels through the ePost system.

### Generation Format
```
VPL26050001
├─ VPL   = Prefix (TRACKING_PREFIX)
├─ 26    = Year-Month Code (YY+MM, where YY = last 2 digits of year)
└─ 0001  = Sequence (4-5 digits, zero-padded for overflow)
```

**Example:** VPL26050001
- VPL = Tracking prefix
- 26 = Year 2026
- 05 = May
- 0001 = First parcel in May 2026

### Detailed Logic

**File:** `apps/api/src/validation/trackingId.ts`

**Constants:**
```typescript
export const TRACKING_PREFIX = "VPL";
```

**Validation Pattern:**
```typescript
const trackingIdPattern = /^VPL\d{8,9}$/;
// Matches: VPL + 8-9 digits (YYMMSSSS or YYMMSSSSS)
```

**Generation Function:**
```typescript
export function buildTrackingId(sequence: number, value?: string | Date) {
  return `${TRACKING_PREFIX}${formatIdentifierDateCode(value)}${formatIdentifierSequence(sequence)}`;
}

export function formatIdentifierDateCode(value?: string | Date) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  const year = String(date.getFullYear()).slice(-2);    // Last 2 digits of year
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

export function formatIdentifierSequence(sequence: number) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error("Identifier sequence must be a positive integer.");
  }
  if (sequence > 99_999) {
    throw new Error("Daily identifier sequence exceeded the supported 5-digit overflow range.");
  }
  const width = sequence > 9_999 ? 5 : 4;  // Use 5 digits for sequences > 9,999
  return String(sequence).padStart(width, "0");
}
```

### Allocation Flow

**File:** `apps/api/src/worker.ts`

**Trigger:** `autoGenerateTracking === true` in job submission

**Steps:**

1. **Parse Manual IDs** - Extract tracking IDs from CSV if provided:
   ```typescript
   const manualTrackingIds = orders
     .map((order, idx) => ({
       idx,
       trackingId: String(order.TrackingID ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, ""),
     }))
     .filter((item) => item.trackingId);
   ```

2. **Check for Duplicates** - Query existing tracking IDs in database:
   ```sql
   SELECT tracking_id FROM shipments
   WHERE tracking_id IN (${manualTrackingIds})
   ```

3. **Auto-generate Missing** - For orders without tracking ID:
   ```typescript
   let offset = 1;
   for (const order of ordersNeedingTracking) {
     let replacement = buildTrackingId(offset, new Date());
     // Loop until unique (skip if exists in DB or in manual IDs)
     while (existsInDb(replacement) || manualTrackingIds.includes(replacement)) {
       offset += 1;
       replacement = buildTrackingId(offset, new Date());
     }
     order.trackingId = replacement;
     offset += 1;
   }
   ```

4. **Persist** - Insert generated tracking IDs into `shipments` table

### Database Table
**Table:** `shipments`

**Key Fields:**
- `tracking_id` (STRING, UNIQUE): The generated tracking ID (e.g., "VPL26050001")
- `mo_number` (STRING, FK): Associated MOS (if money order applicable)
- `shipment_type` (STRING): Type (VPL, VPP, COD)
- `status` (STRING): Current status (PENDING, DELIVERED, RETURNED, etc.)
- `created_at` (TIMESTAMP): Creation timestamp

### Re-generation Behavior
- **Initial Generation:** Generated during job processing if `autoGenerateTracking === true`
- **Reuse:** Once generated and persisted, same tracking ID used for all label/MO regenerations
- **No Reissue:** Tracking ID never changes for a shipment after initial generation
- **Manual Override:** User can provide tracking ID in CSV, must satisfy VPL pattern

---

## C. Collision Prevention and Concurrency

### MOS Lock Strategy
- **Scope:** Per issue date + shipment type
- **Mechanism:** PostgreSQL advisory lock (`pg_advisory_xact_lock()`)
- **Duration:** Transaction-scoped (released at transaction end)
- **Benefit:** Prevents duplicate allocation in concurrent batch processing

### Tracking ID Collision Prevention
- **Database Uniqueness:** UNIQUE constraint on `tracking_id` column
- **Memory Set:** `reservedNumbers` Set tracks allocations within single batch
- **Loop Retry:** If collision detected, increment sequence and retry

---

## D. Sequence Overflow Handling

### MOS Overflow
```
Standard:  MOS 05 + 6 digits = MOS05000001 to MOS05999999
Overflow:  MOS 05 + 7 digits = MOS051000000 to MOS059999999
```
- **Trigger:** When sequence > 999,999
- **Format:** Automatically expands to 7 digits
- **Example:** MOS05999999 → MOS051000000 (next sequence)

### Tracking ID Overflow
```
Standard:  VPL 26 05 + 4 digits = VPL26050001 to VPL26059999
Overflow:  VPL 26 05 + 5 digits = VPL260510000 to VPL260599999
Limit:     Max 5-digit sequence = VPL2605099999 (after which, system errors)
```
- **Trigger:** When sequence > 9,999
- **Format:** Automatically expands to 5 digits
- **Max:** 99,999 sequences per month (then throws error)

---

## E. Key Files and Functions Summary

| Component | File | Function | Purpose |
|-----------|------|----------|---------|
| **MOS Generation** | `apps/api/src/validation/trackingId.ts` | `buildMoneyOrderNumber()` | Construct MOS string |
| **MOS Allocation** | `apps/api/src/worker.ts` | `allocateNextMoneyOrderNumber()` | Allocate unique MOS with collision prevention |
| **VPL Generation** | `apps/api/src/validation/trackingId.ts` | `buildTrackingId()` | Construct VPL string |
| **VPL Allocation** | `apps/api/src/worker.ts` | (inline in batch processor) | Auto-generate VPL for missing tracking |
| **Validation** | `apps/api/src/validation/trackingId.ts` | `validateTrackingId()` | Validate tracking ID format |
| **Validation** | `apps/api/src/validation/trackingId.ts` | `validateMoneyOrderNumber()` | Validate MOS format |
| **Footer CSS** | `apps/api/src/lib/printBranding.ts` | `PRINTABLE_FOOTER_CSS` | CSS for printable document footers |
| **Money Order HTML** | `apps/api/src/templates/labels.ts` | `moneyOrderHtmlFromBenchmark()` | Generate money order HTML with footer injection |

---

## F. Fallback and Error Handling

### MOS Allocation Failures
1. **No Latest Found:** Start sequence at 1
2. **Duplicate Detected:** Increment sequence and retry (logged as warning)
3. **Lock Timeout:** Transaction rolled back, job retried
4. **Database Error:** Throw error, halt batch processing

### Tracking ID Allocation Failures
1. **Overflow Exceeded:** Throw error "Daily identifier sequence exceeded the supported 5-digit overflow range."
2. **Manual ID Invalid:** Reject with validation error, no auto-fallback
3. **Collision:** Increment sequence and retry (silent, no warning)

### CSV Input Validation
- **Provided MOS:** Must match `/^(MOS|UMO)(0[1-9]|1[0-2])\d{6,7}$/`
- **Provided Tracking ID:** Must match `/^VPL\d{8,9}$/`
- **Invalid:** Error returned to user, no partial processing

---

## G. Usage Examples

### Example 1: MOS Generation Flow
```
1. CSV uploaded with 50 orders, no MOS provided
2. Issue date: 2026-05-10 (05 = May)
3. Allocation starts:
   - Query latest MOS05% → finds MOS05040500
   - Extract sequence: 40500
   - Next sequence: 40501
   - Allocate: MOS05040501, MOS05040502, ..., MOS05040550
   - All 50 stored in money_orders table
```

### Example 2: Tracking ID Generation Flow
```
1. CSV uploaded with 30 orders, 20 have tracking IDs, 10 missing
2. Auto-generate enabled, date: 2026-05-10
3. Manual IDs parsed: VPL26050001 to VPL26050020 (extracted from CSV)
4. Check duplicates in DB → VPL26050015 already exists
5. Auto-generate for 10 missing:
   - Query latest VPL2605%
   - Start offset: 50 (example, next available)
   - Generate: VPL26050051, VPL26050052, ..., VPL26050060
   - Skip VPL26050015 if collision detected
6. All 30 shipments persisted with tracking IDs
```

### Example 3: Overflow Scenario
```
MOS:
- Date: 2026-05-10
- Latest: MOS05999999 (6-digit sequence at max)
- Next allocation uses 7-digit format: MOS051000000

Tracking ID:
- Date: 2026-05-10
- Latest: VPL26059999 (4-digit sequence at max)
- Next allocation uses 5-digit format: VPL260510000
```

---

## H. Change History

- **2026-05-10:** Documentation created
- **2026-05-10:** Money order footer rendering fixed and injected into `moneyOrderHtmlFromBenchmark()`
- **2026-05-10:** Footer CSS updated with display:block, 11px font-size, overflow:visible, overflow-wrap:anywhere, padding:0 12px
