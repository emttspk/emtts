export const LEGACY_SHIPMENT_ALIASES: Readonly<Record<string, string>> = {
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

export function resolveLegacyShipmentAlias(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return LEGACY_SHIPMENT_ALIASES[normalized] ?? null;
}

export function isLegacyAlias(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return false;
  return Object.prototype.hasOwnProperty.call(LEGACY_SHIPMENT_ALIASES, normalized);
}

export function logCatalogShadowWarning(kind: "service_mismatch" | "invalid_prefix" | "fallback_coercion" | "legacy_mapping" | "row_override", detail: string) {
  console.warn(`[CatalogShadow][${kind}] ${detail}`);
}
