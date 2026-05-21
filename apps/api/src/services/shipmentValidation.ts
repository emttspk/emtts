import { logCatalogShadowWarning } from "../catalog/legacyShipmentAliases.js";
import { getServiceByCode } from "../catalog/serviceCatalog.js";

export function trackingPrefixOf(value: unknown) {
  return String(value ?? "").trim().toUpperCase().match(/^([A-Z]{2,4})/)?.[1] ?? "";
}

export function shadowCheckServicePrefix(service: unknown, trackingId: unknown) {
  const normalizedService = String(service ?? "").trim().toUpperCase();
  const prefix = trackingPrefixOf(trackingId);
  if (!normalizedService || !prefix) return;

  const entry = getServiceByCode(normalizedService);
  if (!entry) {
    logCatalogShadowWarning("service_mismatch", `Unknown service '${normalizedService}' observed during shadow validation.`);
    return;
  }

  if (!prefix.startsWith(entry.prefix)) {
    logCatalogShadowWarning(
      "invalid_prefix",
      `Service '${normalizedService}' expects prefix '${entry.prefix}' but tracking '${String(trackingId)}' used '${prefix}'.`,
    );
  }
}
