export const LEGACY_SHIPMENT_ALIASES: Record<string, string> = {
  RL: "RGL",
  DOCUMENT: "IRL",
  DOCUMENTS: "IRL",
  "SMALL PACKET": "RGL",
  SMALL_PACKET: "RGL",
  SMALLPACKET: "RGL",
  PAR: "VPP",
  PARCEL: "VPP",
  PARCELS: "VPP",
  PR: "VPP",
};

const LEGACY_PARCEL_VALUES = new Set(["PAR", "PARCEL", "PARCELS", "PR"]);
const MONEY_ORDER_ELIGIBLE = new Set(["VPL", "VPP", "COD"]);

export function normalizeShipmentType(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function resolveShipmentTypeWithLegacy(value: unknown): string | null {
  const normalized = normalizeShipmentType(value);
  if (!normalized) return null;
  return LEGACY_SHIPMENT_ALIASES[normalized] ?? normalized;
}

export function isMoneyOrderEligible(service: unknown) {
  const resolved = resolveShipmentTypeWithLegacy(service);
  return Boolean(resolved && MONEY_ORDER_ELIGIBLE.has(resolved));
}

export function isLegacyParcelCompatible(service: unknown) {
  const normalized = normalizeShipmentType(service);
  return LEGACY_PARCEL_VALUES.has(normalized);
}

export function shipmentTypeDisplayLabel(service: unknown) {
  const normalized = normalizeShipmentType(service);
  if (isLegacyParcelCompatible(normalized)) {
    return "PAR (Legacy / Parcel Compatible)";
  }
  return normalized;
}
