export const LEGACY_SHIPMENT_ALIASES: Readonly<Record<string, string>> = {
  RL: "RGL",
  DOCUMENT: "IRL",
  DOCUMENTS: "IRL",
  "SMALL PACKET": "RGL",
  SMALL_PACKET: "RGL",
  SMALLPACKET: "RGL",
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

export function logCatalogShadowWarning(kind: "service_mismatch" | "invalid_prefix" | "fallback_coercion" | "row_override", detail: string) {
  console.warn(`[CatalogShadow][${kind}] ${detail}`);
}
