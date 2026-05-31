import type { AggregatorBooking, AggregatorBookingItem } from "@prisma/client";

export const AGGREGATOR_WAREHOUSE_OPTIONS = [
  "EPOST_LAHORE_WAREHOUSE",
  "EPOST_SAHIWAL_WAREHOUSE",
] as const;

export type AggregatorWarehouseOption = (typeof AGGREGATOR_WAREHOUSE_OPTIONS)[number];

export const AGGREGATOR_INTAKE_CARRIER_OPTIONS = [
  "CUSTOMER_SELF_DROP",
  "PAKISTAN_POST_BULK_PACK",
  "LEOPARDS_BULK_PACK",
] as const;

export type AggregatorIntakeCarrierOption = (typeof AGGREGATOR_INTAKE_CARRIER_OPTIONS)[number];

export const BULK_PACK_MANUAL_NOTICE = "This label is for sending the complete bundle to ePost warehouse. It is not the final Pakistan Post delivery label for individual articles.";

export const MANIFEST_MANUAL_NOTICE = "Manual planning only. Manifest preview is for verification before hub receiving and does not create pickup, dispatch, courier booking, or Pakistan Post booking.";

const WAREHOUSE_ADDRESS: Record<AggregatorWarehouseOption, string> = {
  EPOST_LAHORE_WAREHOUSE: "ePost Lahore Warehouse, Main Collection Hub, Lahore",
  EPOST_SAHIWAL_WAREHOUSE: "ePost Sahiwal Warehouse, Regional Collection Hub, Sahiwal",
};

function toSafeInt(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function resolveWarehouseAddress(warehouse: AggregatorWarehouseOption) {
  return WAREHOUSE_ADDRESS[warehouse];
}

export function resolveCarrierService(carrier: AggregatorIntakeCarrierOption) {
  if (carrier === "CUSTOMER_SELF_DROP") return "SELF_DROP_TO_WAREHOUSE";
  if (carrier === "PAKISTAN_POST_BULK_PACK") return "PAKISTAN_POST_BULK_PACK";
  return "LEOPARDS_BULK_PACK";
}

export function computeBundleWeightGrams(booking: Pick<AggregatorBooking, "totalChargeableWeightGrams" | "totalActualWeightGrams">) {
  const chargeable = toSafeInt(booking.totalChargeableWeightGrams);
  if (chargeable > 0) return chargeable;
  return toSafeInt(booking.totalActualWeightGrams);
}

export function isManualPlanningEligible(booking: Pick<AggregatorBooking, "status" | "paymentStatus" | "totalArticles" | "totalActualWeightGrams" | "totalChargeableWeightGrams">) {
  const allowedStatuses = ["PAYMENT_PENDING_PLACEHOLDER", "DROP_PENDING", "PICKUP_PENDING_FUTURE"];
  const allowedPaymentStatuses = ["PENDING_PLACEHOLDER", "MARKED_FOR_OFFLINE_COLLECTION"];

  if (!allowedStatuses.includes(String(booking.status ?? ""))) {
    return { ok: false as const, reason: "Booking is not in a manual-approved/payment-ready state for bulk-pack planning" };
  }

  if (!allowedPaymentStatuses.includes(String(booking.paymentStatus ?? ""))) {
    return { ok: false as const, reason: "Payment placeholder state is not ready for manual bulk-pack planning" };
  }

  const totalArticles = toSafeInt(booking.totalArticles);
  if (totalArticles <= 0) {
    return { ok: false as const, reason: "totalArticles must be greater than 0" };
  }

  const totalBundleWeightGrams = computeBundleWeightGrams(booking);
  if (totalBundleWeightGrams <= 0) {
    return { ok: false as const, reason: "totalBundleWeightGrams must be greater than 0" };
  }

  return { ok: true as const };
}

export function createBulkPackNo(bookingNo: string) {
  return `BPK-${String(bookingNo ?? "").trim()}`;
}

export function buildBulkPackLabelPreview(input: {
  booking: Pick<AggregatorBooking, "bookingNo" | "senderName" | "senderPhone" | "senderCity" | "totalArticles" | "totalActualWeightGrams" | "totalChargeableWeightGrams">;
  selectedWarehouse: AggregatorWarehouseOption;
  intakeCarrier: AggregatorIntakeCarrierOption;
  paymentVerifiedReference: string;
  instructions: string;
}) {
  const bulkPackNo = createBulkPackNo(input.booking.bookingNo);
  const warehouseAddress = resolveWarehouseAddress(input.selectedWarehouse);
  const carrierService = resolveCarrierService(input.intakeCarrier);
  const totalBundleWeightGrams = computeBundleWeightGrams(input.booking);
  const barcodeOrQr = `BPK|${input.booking.bookingNo}|${bulkPackNo}|${input.selectedWarehouse}|${input.intakeCarrier}`;

  return {
    bookingNo: input.booking.bookingNo,
    bulkPackNo,
    customerName: input.booking.senderName,
    customerPhone: input.booking.senderPhone,
    senderCity: input.booking.senderCity,
    totalArticles: toSafeInt(input.booking.totalArticles),
    totalBundleWeightGrams,
    selectedWarehouse: input.selectedWarehouse,
    warehouseAddress,
    intakeCarrier: input.intakeCarrier,
    carrierService,
    paymentVerifiedReference: input.paymentVerifiedReference,
    instructions: input.instructions,
    barcodeOrQr,
    createdAt: new Date().toISOString(),
    manualProcessingNotice: BULK_PACK_MANUAL_NOTICE,
  };
}

export function buildManifestPreview(input: {
  booking: Pick<AggregatorBooking, "bookingNo" | "totalArticles" | "totalActualWeightGrams" | "totalChargeableWeightGrams">;
  items: Array<Pick<AggregatorBookingItem, "rowNo" | "serviceCode" | "articleCategory" | "receiverCity" | "weightGrams" | "chargeableWeightGrams" | "totalOfficialPostalCharge">>;
  selectedWarehouse: AggregatorWarehouseOption;
  intakeCarrier: AggregatorIntakeCarrierOption;
}) {
  const expectedArticles = toSafeInt(input.booking.totalArticles);
  const totalBundleWeightGrams = computeBundleWeightGrams(input.booking);

  return {
    bookingNo: input.booking.bookingNo,
    expectedArticles,
    totalBundleWeightGrams,
    articleRows: input.items.map((row) => ({
      rowNo: row.rowNo,
      serviceCode: row.serviceCode,
      articleCategory: row.articleCategory,
      receiverCity: row.receiverCity,
      weightGrams: toSafeInt(row.weightGrams),
      chargeableWeightGrams: toSafeInt(row.chargeableWeightGrams),
      totalOfficialPostalCharge: toSafeInt(row.totalOfficialPostalCharge),
    })),
    selectedWarehouse: input.selectedWarehouse,
    intakeCarrier: input.intakeCarrier,
    generatedAt: new Date().toISOString(),
    manualVerificationNotice: MANIFEST_MANUAL_NOTICE,
  };
}
