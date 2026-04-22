export const TRACKING_PREFIX = "VPL";
export const MONEY_ORDER_PREFIX = "MOS";
export const MONEY_ORDER_SPLIT_LIMIT = 20_000;

const allowedTrackingPrefixes = [TRACKING_PREFIX] as const;

const trackingIdPattern = /^VPL\d{8,9}$/;
const moneyOrderNumberPattern = /^MOS(?:\d{8}|\d{11})$/;

export type StrictTrackingValidation = { ok: true; value: string } | { ok: false; reason: string };

export type MoneyOrderBreakdownLine = {
  segmentIndex: number;
  grossAmount: number;
  total: number;
  commission: number;
  moAmount: number;
  netAmount: number;
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
    throw new Error("Daily identifier sequence exceeded the supported 5-digit overflow range.");
  }
  const width = sequence > 9_999 ? 5 : 4;
  return String(sequence).padStart(width, "0");
}

export function buildTrackingId(sequence: number, value?: string | Date) {
  return `${TRACKING_PREFIX}${formatIdentifierDateCode(value)}${formatIdentifierSequence(sequence)}`;
}

export function buildMoneyOrderNumber(sequence: number, value?: string | Date) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const dateCode = sequence > 9_999 ? `${year}${month}${day}` : `${year}${month}`;
  return `${MONEY_ORDER_PREFIX}${dateCode}${formatIdentifierSequence(sequence)}`;
}

export function parseIdentifierSequence(value: string) {
  const normalized = String(value ?? "").trim().toUpperCase();
  const suffix = normalized.slice(-5);
  const parsed = Number.parseInt(suffix, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  const fallback = Number.parseInt(normalized.slice(-4), 10);
  return Number.isFinite(fallback) ? fallback : null;
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
      reason: "trackingId must match VPLYYMM0001 format, with 12 characters allowed only after sequence overflow",
    };
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
      reason: "money order number must match MOSYYMM0001 format; after 9999, format switches to MOSYYMMDD00000",
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
    const commission = chargeCommission ? commissionFor(moAmount) : 0;
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