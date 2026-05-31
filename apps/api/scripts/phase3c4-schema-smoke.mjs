import {
  adminFinalProcessingPacketExportSchema,
  adminFinalProcessingPacketSchema,
  adminFinalProcessingReadinessSchema,
  adminFinalProcessingReviewSchema,
  manualOnlyFinalProcessingFlagsSchema,
} from "../src/utils/aggregatorBookingValidation.ts";

const manualFlags = {
  manualOnly: true,
  noPakistanPostBookingApi: true,
  noFinalBookingConfirmation: true,
  noLiveBooking: true,
  noLabelJobCreation: true,
  noUnitConsumption: true,
  noAutoDispatch: true,
};

let assertions = 0;

function assertPass(name, fn) {
  assertions += 1;
  try {
    fn();
    console.log(`PASS ${assertions}: ${name}`);
  } catch (error) {
    console.error(`FAIL ${assertions}: ${name}`);
    throw error;
  }
}

function assertFail(name, fn) {
  assertions += 1;
  try {
    fn();
  } catch (_error) {
    console.log(`PASS ${assertions}: ${name}`);
    return;
  }
  console.error(`FAIL ${assertions}: ${name}`);
  throw new Error(`Expected failure did not occur for: ${name}`);
}

assertPass("readiness accepts valid payload", () => {
  adminFinalProcessingReadinessSchema.parse({
    expectedArticleCount: 10,
    verifiedArticleCount: 10,
    servicesIncluded: ["RGL", "PAR"],
    exceptions: [],
    note: "Manual readiness check completed.",
    manualFlags,
  });
});

assertFail("readiness rejects final booking wording", () => {
  adminFinalProcessingReadinessSchema.parse({
    expectedArticleCount: 10,
    verifiedArticleCount: 9,
    servicesIncluded: ["RGL"],
    note: "Final booking confirmation issued.",
    manualFlags,
  });
});

assertFail("readiness rejects missing manual flags", () => {
  adminFinalProcessingReadinessSchema.parse({
    expectedArticleCount: 10,
    verifiedArticleCount: 10,
    servicesIncluded: ["RGL"],
    note: "Manual readiness check completed.",
  });
});

assertFail("readiness rejects unknown service code", () => {
  adminFinalProcessingReadinessSchema.parse({
    expectedArticleCount: 10,
    verifiedArticleCount: 10,
    servicesIncluded: ["XYZ"],
    note: "Manual readiness check completed.",
    manualFlags,
  });
});

assertPass("packet accepts standard non-value-payable rows", () => {
  adminFinalProcessingPacketSchema.parse({
    packetNo: "PKT-1001",
    articleRows: [
      {
        rowNo: 1,
        serviceCode: "RGL",
        articleCategory: "LETTER",
        receiverCity: "Lahore",
        chargeableWeightGrams: 250,
        totalOfficialPostalCharge: 100,
      },
    ],
    readinessWarnings: [],
    note: "Manual packet prepared for review.",
    manualFlags,
  });
});

assertFail("packet requires warnings for COD/VPL/VPP", () => {
  adminFinalProcessingPacketSchema.parse({
    packetNo: "PKT-1002",
    articleRows: [
      {
        rowNo: 1,
        serviceCode: "COD",
        articleCategory: "PARCEL",
        receiverCity: "Karachi",
        chargeableWeightGrams: 500,
        totalOfficialPostalCharge: 220,
      },
    ],
    readinessWarnings: [],
    note: "Manual packet prepared for review.",
    manualFlags,
  });
});

assertFail("packet rejects forbidden final-booking wording", () => {
  adminFinalProcessingPacketSchema.parse({
    packetNo: "PKT-1003",
    articleRows: [
      {
        rowNo: 1,
        serviceCode: "RGL",
        articleCategory: "LETTER",
        receiverCity: "Islamabad",
        chargeableWeightGrams: 200,
        totalOfficialPostalCharge: 95,
      },
    ],
    readinessWarnings: [],
    note: "Pakistan Post booking confirmed.",
    manualFlags,
  });
});

assertFail("packet rejects invalid row numbering", () => {
  adminFinalProcessingPacketSchema.parse({
    packetNo: "PKT-1004",
    articleRows: [
      {
        rowNo: 0,
        serviceCode: "RGL",
        articleCategory: "LETTER",
      },
    ],
    readinessWarnings: [],
    note: "Manual packet prepared for review.",
    manualFlags,
  });
});

assertPass("export accepts valid payload with default format", () => {
  const parsed = adminFinalProcessingPacketExportSchema.parse({
    packetNo: "PKT-2001",
    note: "Manual export generated for operations review.",
    manualFlags,
  });
  if (parsed.exportFormat !== "json") {
    throw new Error("Expected default exportFormat to be json");
  }
});

assertFail("export rejects too-short packet number", () => {
  adminFinalProcessingPacketExportSchema.parse({
    packetNo: "P1",
    note: "Manual export generated for operations review.",
    manualFlags,
  });
});

assertFail("export rejects forbidden final-booking wording", () => {
  adminFinalProcessingPacketExportSchema.parse({
    packetNo: "PKT-2002",
    note: "Booking confirmed and finalized.",
    manualFlags,
  });
});

assertPass("review accepts valid payload", () => {
  adminFinalProcessingReviewSchema.parse({
    packetNo: "PKT-3001",
    reviewNote: "Manual final processing review completed with checks.",
    manualFlags,
  });
});

assertFail("review rejects too-short note", () => {
  adminFinalProcessingReviewSchema.parse({
    packetNo: "PKT-3002",
    reviewNote: "too short",
    manualFlags,
  });
});

assertFail("review rejects forbidden final-booking wording", () => {
  adminFinalProcessingReviewSchema.parse({
    packetNo: "PKT-3003",
    reviewNote: "Final booking confirmation has been sent to customer.",
    manualFlags,
  });
});

assertFail("manual flags reject unknown keys", () => {
  manualOnlyFinalProcessingFlagsSchema.parse({
    ...manualFlags,
    unsafeExtraFlag: true,
  });
});

if (assertions !== 15) {
  throw new Error(`Expected 15 assertions, got ${assertions}`);
}

console.log("SMOKE_SCHEMA_ALL_DONE");
