// Tracking prefixes as per Pakistan Post standards
export const TRACKING_PREFIX_VPL = "VPL"; // Value Payable Letter
export const TRACKING_PREFIX_VPP = "VPP"; // Value Payable Parcel
export const TRACKING_PREFIX_COD = "COD"; // Cash on Delivery
export const TRACKING_PREFIX_PAR = "PAR"; // Parcel
export const TRACKING_PREFIX_IRL = "IRL"; // Insured Registered Letter
export const TRACKING_PREFIX_RGL = "RGL"; // Registered Letter
export const TRACKING_PREFIX_UMS = "UMS"; // Urgent Mail Service

// Money order prefixes
export const MONEY_ORDER_PREFIX = "MOS";     // For VPL, VPP, IRL
export const MONEY_ORDER_PREFIX_COD = "UMO"; // For COD

export const MONEY_ORDER_SPLIT_LIMIT = 20_000;

const allowedTrackingPrefixes = [
  TRACKING_PREFIX_VPL,
  TRACKING_PREFIX_VPP,
  TRACKING_PREFIX_COD,
  TRACKING_PREFIX_PAR,
  TRACKING_PREFIX_IRL,
  TRACKING_PREFIX_RGL,
  TRACKING_PREFIX_UMS,
] as const;

// Pattern: Prefix (3 chars) + YY (2 year digits) + MM (2 month digits) + Sequence (4-5 digits) = 11-12 total
const trackingIdPattern = /^(VPL|VPP|COD|PAR|IRL|RGL|UMS)\d{8,9}$/;
// Money order pattern: Prefix (3 chars) + MM (2 month digits) + Sequence (6-7 digits) = 11-12 total
const moneyOrderNumberPattern = /^(MOS|UMO)(0[1-9]|1[0-2])\d{6,7}$/;

export type StrictTrackingValidation = { ok: true; value: string } | { ok: false; reason: string };

export type MoneyOrderBreakdownLine = {
  segmentIndex: number;
  grossAmount: number;
  total: number;
  commission: number;
  moAmount: number;
  netAmount: number;
};

export type MoneyOrderTotals = {
  grossAmount: number;
  moAmount: number;
  commission: number;
};

export function getAllowedTrackingPrefixes() {
  return [...allowedTrackingPrefixes];
}

export function normalizeTrackingId(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeMoneyOrderNumber(value: unknown): string {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizeShipmentType(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function normalizeCarrierType(value: unknown): "pakistan_post" | "courier" {
  return String(value ?? "").trim().toLowerCase() === "courier" ? "courier" : "pakistan_post";
}

export function isPakistanPostCarrier(value: unknown) {
  return normalizeCarrierType(value) === "pakistan_post";
}

export function isValuePayableShipmentType(value: unknown): value is "VPL" | "VPP" {
  const normalized = normalizeShipmentType(value);
  return normalized === "VPL" || normalized === "VPP";
}

export function isMoneyOrderEligibleShipmentType(value: unknown): value is "VPL" | "VPP" | "COD" {
  const normalized = normalizeShipmentType(value);
  return normalized === "VPL" || normalized === "VPP" || normalized === "COD";
}

export function shouldChargeMoneyOrderCommission(value: unknown) {
  return isValuePayableShipmentType(value);
}

export function shouldShowValuePayableAmount(value: unknown) {
  return isMoneyOrderEligibleShipmentType(value);
}

export function shouldApplyPakistanPostValuePayableRules(carrierType: unknown, shipmentType: unknown) {
  return isPakistanPostCarrier(carrierType) && isMoneyOrderEligibleShipmentType(shipmentType);
}

export function formatIdentifierDateCode(value?: string | Date) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}${month}`;
}

export function formatIdentifierSequence(sequence: number) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error("Identifier sequence must be a positive integer.");
  }
  if (sequence > 99_999) {
    throw new Error("Tracking sequence exceeded the supported 5-digit overflow range.");
  }
  const width = sequence > 9_999 ? 5 : 4;
  return String(sequence).padStart(width, "0");
}

/**
 * Get the tracking prefix for a given shipment type.
 * Defaults to VPL if shipment type is not recognized.
 */
export function getTrackingPrefix(shipmentType?: unknown): string {
  const normalized = String(shipmentType ?? "").trim().toUpperCase();
  switch (normalized) {
    case "VPP":
      return TRACKING_PREFIX_VPP;
    case "COD":
      return TRACKING_PREFIX_COD;
    case "PAR":
      return TRACKING_PREFIX_PAR;
    case "IRL":
      return TRACKING_PREFIX_IRL;
    case "RGL":
    case "RL": // Accept "RL" as alias for RGL
      return TRACKING_PREFIX_RGL;
    case "UMS":
      return TRACKING_PREFIX_UMS;
    case "VPL":
    default:
      return TRACKING_PREFIX_VPL;
  }
}

/**
 * Build a tracking ID with proper format: XXXYYMMXXXX
 * where XXX is the prefix, YY is 2-digit year, MM is month (01-12), and XXXX/XXXXX is 4-5 digit sequence
 */
export function buildTrackingId(sequence: number, value?: string | Date, shipmentType?: unknown) {
  const prefix = getTrackingPrefix(shipmentType);
  return `${prefix}${formatIdentifierDateCode(value)}${formatIdentifierSequence(sequence)}`;
}

export function buildMoneyOrderNumber(sequence: number, value?: string | Date, shipmentType?: unknown) {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error("Money order sequence must be a positive integer.");
  }
  const normalizedType = String(shipmentType ?? "").trim().toUpperCase();
  const prefix = normalizedType === "COD" ? MONEY_ORDER_PREFIX_COD : MONEY_ORDER_PREFIX;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const width = sequence > 999_999 ? 7 : 6;
  return `${prefix}${month}${String(sequence).padStart(width, "0")}`;
}

export function parseIdentifierSequence(value: string) {
  const normalized = String(value ?? "").trim().toUpperCase();
  const parsed = Number.parseInt(normalized.slice(-6), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidTrackingId(value: unknown): boolean {
  return validateTrackingId(value).ok;
}

export function validateTrackingId(value: unknown): StrictTrackingValidation {
  const compact = normalizeTrackingId(value);

  if (!compact) {
    return { ok: false, reason: "trackingId is required" };
  }

  if (!trackingIdPattern.test(compact)) {
    return {
      ok: false,
      reason: "trackingId must match XXXYYMMXXXX format (e.g., PAR26050001, VPL26050001, COD26050001) with 11-12 characters",
    };
  }

  return { ok: true, value: compact };
}

/**
 * Validate a tracking ID that was uploaded by a user.
 * Accepts any non-empty string — no format restriction.
 * Use this for upload/manual flows. Use validateTrackingId() only for system-generated IDs.
 */
export function validateUploadedTrackingId(value: unknown): StrictTrackingValidation {
  const compact = normalizeTrackingId(value);
  if (!compact) {
    return { ok: false, reason: "trackingId is required" };
  }
  return { ok: true, value: compact };
}

export function validateMoneyOrderNumber(value: unknown): StrictTrackingValidation {
  const compact = normalizeMoneyOrderNumber(value);

  if (!compact) {
    return { ok: false, reason: "money order number is required" };
  }

  if (!moneyOrderNumberPattern.test(compact)) {
    return {
      ok: false,
      reason: "money order number must match MOSMMXXXXXX or UMOMMXXXXXX format (6–7 digit sequence)",
    };
  }

  return { ok: true, value: compact };
}

function commissionFor(blockTotal: number) {
  return blockTotal <= 10_000 ? 75 : 100;
}

function splitBlocks(total: number) {
  const normalizedTotal = Math.max(0, Math.floor(total));
  if (normalizedTotal === 0) {
    return [] as number[];
  }

  const blocks: number[] = [];
  let remaining = normalizedTotal;
  while (remaining > MONEY_ORDER_SPLIT_LIMIT) {
    blocks.push(MONEY_ORDER_SPLIT_LIMIT);
    remaining -= MONEY_ORDER_SPLIT_LIMIT;
  }
  if (remaining > 0) {
    blocks.push(remaining);
  }
  return blocks;
}

export function moneyOrderBreakdown(total: number, shipmentType?: unknown): MoneyOrderBreakdownLine[] {
  const chargeCommission = shipmentType == null || shipmentType === ""
    ? true
    : shouldChargeMoneyOrderCommission(shipmentType);
  return splitBlocks(total).map((blockMoAmount, index) => {
    const moAmount = Math.max(0, blockMoAmount);
    const commission = chargeCommission
      ? moAmount <= 10_000
        ? 75
        : 100
      : 0;
    const grossAmount = moAmount + commission;
    const netAmount = moAmount;
    return {
      segmentIndex: index,
      grossAmount,
      total: grossAmount,
      commission,
      moAmount,
      netAmount,
    };
  });
}

export function reverseMoneyOrderFromGross(grossAmount: number, shipmentType?: unknown): MoneyOrderTotals {
  const gross = Math.max(0, Math.floor(grossAmount));
  const normalizedShipment = normalizeShipmentType(shipmentType);

  if (normalizedShipment === "COD") {
    return {
      grossAmount: gross,
      moAmount: gross,
      commission: 0,
    };
  }

  if (normalizedShipment === "VPL" || normalizedShipment === "VPP") {
    const commission = gross <= 10_000 ? 75 : 100;
    return {
      grossAmount: gross,
      moAmount: Math.max(0, gross - commission),
      commission,
    };
  }

  return {
    grossAmount: gross,
    moAmount: gross,
    commission: 0,
  };
}