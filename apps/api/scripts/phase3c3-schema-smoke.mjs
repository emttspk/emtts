/**
 * Phase 3C-3 schema smoke.  Run with:
 *   npx tsx scripts/phase3c3-schema-smoke.mjs
 */
import { z } from "zod";

const manualOnlyHandoffFlagsSchema = z.object({
  manualHandoffOnly: z.literal(true),
  noFinalDispatch: z.literal(true),
  noLiveCarrierApi: z.literal(true),
  noPakistanPostBookingApi: z.literal(true),
  noPickupExecution: z.literal(true),
  noDispatchExecution: z.literal(true),
  noFinalBookingConfirmation: z.literal(true),
});

const adminDriverHandoffSchema = z.object({
  handoffType: z.string().trim().min(2).max(80),
  fromParty: z.string().trim().min(2).max(120),
  toParty: z.string().trim().min(2).max(120),
  receivedBy: z.string().trim().min(2).max(120),
  bundleCondition: z.string().trim().min(5).max(500),
  articleCount: z.coerce.number().int().min(0),
  note: z.string().trim().min(5).max(2000),
  manualFlags: manualOnlyHandoffFlagsSchema,
}).strict();

const adminHubSortingDispatchSchema = z.object({
  fromWarehouse: z.string().trim().min(2).max(120),
  toSortingFacility: z.string().trim().min(2).max(120),
  dispatchedBy: z.string().trim().min(2).max(120),
  expectedArticleCount: z.coerce.number().int().min(0),
  bundleWeightGrams: z.coerce.number().int().positive().optional(),
  transportMode: z.string().trim().min(2).max(80),
  note: z.string().trim().min(5).max(2000),
  manualFlags: manualOnlyHandoffFlagsSchema,
}).strict();

const adminInterFacilityTransferSchema = z.object({
  fromFacility: z.string().trim().min(2).max(120),
  toFacility: z.string().trim().min(2).max(120),
  transferBy: z.string().trim().min(2).max(120),
  transferReference: z.string().trim().min(2).max(120).optional(),
  articleCount: z.coerce.number().int().min(0),
  note: z.string().trim().min(5).max(2000),
  manualFlags: manualOnlyHandoffFlagsSchema,
}).strict();

const adminReadyForPostalSchema = z.object({
  expectedArticleCount: z.coerce.number().int().min(0),
  note: z.string().trim().min(10).max(2000),
  manualFlags: manualOnlyHandoffFlagsSchema,
}).strict();

const ok = {
  manualHandoffOnly: true,
  noFinalDispatch: true,
  noLiveCarrierApi: true,
  noPakistanPostBookingApi: true,
  noPickupExecution: true,
  noDispatchExecution: true,
  noFinalBookingConfirmation: true,
};

let pass = 0, fail = 0;
function assert(label, got, expected = true) {
  if (got === expected) {
    console.log("PASS", label);
    pass++;
  } else {
    console.log("FAIL", label, { got, expected });
    fail++;
  }
}

// ---- Driver Handoff ----
// 1. Valid driver handoff
assert("DRIVER_HANDOFF_VALID", adminDriverHandoffSchema.safeParse({
  handoffType: "DRIVER_TO_HUB",
  fromParty: "Driver A",
  toParty: "Lahore Hub",
  receivedBy: "Hub Staff",
  bundleCondition: "Bundle intact and sealed.",
  articleCount: 10,
  note: "Handoff at 10am local time.",
  manualFlags: ok,
}).success);

// 2. fromParty too short
assert("DRIVER_HANDOFF_REJECTS_SHORT_FROM_PARTY", adminDriverHandoffSchema.safeParse({
  handoffType: "DRIVER_TO_HUB",
  fromParty: "A",
  toParty: "Lahore Hub",
  receivedBy: "Hub Staff",
  bundleCondition: "Bundle intact and sealed.",
  articleCount: 10,
  note: "Handoff at 10am local time.",
  manualFlags: ok,
}).success, false);

// 3. bundleCondition too short
assert("DRIVER_HANDOFF_REJECTS_SHORT_CONDITION", adminDriverHandoffSchema.safeParse({
  handoffType: "DRIVER_TO_HUB",
  fromParty: "Driver A",
  toParty: "Lahore Hub",
  receivedBy: "Hub Staff",
  bundleCondition: "Ok",
  articleCount: 10,
  note: "Handoff at 10am local time.",
  manualFlags: ok,
}).success, false);

// 4. noFinalDispatch must be true
assert("DRIVER_HANDOFF_REJECTS_DISPATCH_FALSE", adminDriverHandoffSchema.safeParse({
  handoffType: "DRIVER_TO_HUB",
  fromParty: "Driver A",
  toParty: "Lahore Hub",
  receivedBy: "Hub Staff",
  bundleCondition: "Bundle intact and sealed.",
  articleCount: 10,
  note: "Handoff at 10am local time.",
  manualFlags: { ...ok, noFinalDispatch: false },
}).success, false);

// 5. manualHandoffOnly must be true
assert("DRIVER_HANDOFF_REJECTS_NON_MANUAL", adminDriverHandoffSchema.safeParse({
  handoffType: "DRIVER_TO_HUB",
  fromParty: "Driver A",
  toParty: "Lahore Hub",
  receivedBy: "Hub Staff",
  bundleCondition: "Bundle intact and sealed.",
  articleCount: 10,
  note: "Handoff at 10am local time.",
  manualFlags: { ...ok, manualHandoffOnly: false },
}).success, false);

// ---- Hub Sorting Dispatch ----
// 6. Valid sorting dispatch
assert("SORTING_DISPATCH_VALID", adminHubSortingDispatchSchema.safeParse({
  fromWarehouse: "EPOST_LAHORE_WAREHOUSE",
  toSortingFacility: "GPO Sorting Center Lahore",
  dispatchedBy: "Admin Staff",
  expectedArticleCount: 10,
  transportMode: "Road",
  note: "Dispatching sealed bundles to sorting facility.",
  manualFlags: ok,
}).success);

// 7. Sorting dispatch with optional bundleWeightGrams
assert("SORTING_DISPATCH_WITH_WEIGHT", adminHubSortingDispatchSchema.safeParse({
  fromWarehouse: "EPOST_LAHORE_WAREHOUSE",
  toSortingFacility: "GPO Sorting Center Lahore",
  dispatchedBy: "Admin Staff",
  expectedArticleCount: 10,
  bundleWeightGrams: 5000,
  transportMode: "Road",
  note: "Dispatching sealed bundles to sorting facility.",
  manualFlags: ok,
}).success);

// 8. toSortingFacility required
assert("SORTING_DISPATCH_REJECTS_MISSING_FACILITY", adminHubSortingDispatchSchema.safeParse({
  fromWarehouse: "EPOST_LAHORE_WAREHOUSE",
  dispatchedBy: "Admin Staff",
  expectedArticleCount: 10,
  transportMode: "Road",
  note: "Dispatching sealed bundles to sorting facility.",
  manualFlags: ok,
}).success, false);

// 9. noPakistanPostBookingApi must be true
assert("SORTING_DISPATCH_REJECTS_PP_API_FALSE", adminHubSortingDispatchSchema.safeParse({
  fromWarehouse: "EPOST_LAHORE_WAREHOUSE",
  toSortingFacility: "GPO Sorting Center Lahore",
  dispatchedBy: "Admin Staff",
  expectedArticleCount: 10,
  transportMode: "Road",
  note: "Dispatching sealed bundles to sorting facility.",
  manualFlags: { ...ok, noPakistanPostBookingApi: false },
}).success, false);

// ---- Inter-Facility Transfer ----
// 10. Valid transfer
assert("TRANSFER_VALID", adminInterFacilityTransferSchema.safeParse({
  fromFacility: "GPO Sorting Center Lahore",
  toFacility: "Sahiwal GPO",
  transferBy: "Admin Staff",
  articleCount: 8,
  note: "Transfer bundle sealed and counted.",
  manualFlags: ok,
}).success);

// 11. Transfer with optional transferReference
assert("TRANSFER_WITH_REFERENCE", adminInterFacilityTransferSchema.safeParse({
  fromFacility: "GPO Sorting Center Lahore",
  toFacility: "Sahiwal GPO",
  transferBy: "Admin Staff",
  transferReference: "REF-2026-001",
  articleCount: 8,
  note: "Transfer bundle sealed and counted.",
  manualFlags: ok,
}).success);

// 12. note too short
assert("TRANSFER_REJECTS_SHORT_NOTE", adminInterFacilityTransferSchema.safeParse({
  fromFacility: "GPO Sorting Center Lahore",
  toFacility: "Sahiwal GPO",
  transferBy: "Admin Staff",
  articleCount: 8,
  note: "Hi",
  manualFlags: ok,
}).success, false);

// ---- Ready For Postal ----
// 13. Valid ready-for-postal
assert("READY_FOR_POSTAL_VALID", adminReadyForPostalSchema.safeParse({
  expectedArticleCount: 10,
  note: "All articles ready for final postal processing. Counts verified manually.",
  manualFlags: ok,
}).success);

// 14. note too short (min 10)
assert("READY_FOR_POSTAL_REJECTS_SHORT_NOTE", adminReadyForPostalSchema.safeParse({
  expectedArticleCount: 10,
  note: "Short",
  manualFlags: ok,
}).success, false);

// 15. noFinalBookingConfirmation must be true
assert("READY_FOR_POSTAL_REJECTS_CONFIRMATION_FALSE", adminReadyForPostalSchema.safeParse({
  expectedArticleCount: 10,
  note: "All articles ready for final postal processing. Counts verified manually.",
  manualFlags: { ...ok, noFinalBookingConfirmation: false },
}).success, false);

console.log(`\nResults: ${pass} PASS, ${fail} FAIL`);
if (fail === 0) {
  console.log("SMOKE_SCHEMA_ALL_DONE");
  process.exit(0);
} else {
  process.exit(1);
}
