export type ServiceCategory = "general_post" | "value_payable" | "cod_articles";

export type ServiceCatalogEntry = {
  service: string;
  prefix: string;
  category: ServiceCategory;
  trackingNamespace: boolean;
  moneyOrderNamespace: "MOS" | "UMO" | null;
  barcode: boolean;
  autoGenerate: boolean;
  deprecated?: boolean;
  notes?: string;
};

// Phase-1 source of truth for runtime service metadata.
// Strict enforcement is intentionally deferred; this is integration-only.
export const SERVICE_CATALOG: readonly ServiceCatalogEntry[] = [
  {
    service: "VPL",
    prefix: "VPL",
    category: "value_payable",
    trackingNamespace: true,
    moneyOrderNamespace: "MOS",
    barcode: true,
    autoGenerate: true,
  },
  {
    service: "VPP",
    prefix: "VPP",
    category: "value_payable",
    trackingNamespace: true,
    moneyOrderNamespace: "MOS",
    barcode: true,
    autoGenerate: true,
  },
  {
    service: "COD",
    prefix: "COD",
    category: "cod_articles",
    trackingNamespace: true,
    moneyOrderNamespace: "UMO",
    barcode: true,
    autoGenerate: true,
  },
  {
    service: "RGL",
    prefix: "RGL",
    category: "general_post",
    trackingNamespace: true,
    moneyOrderNamespace: null,
    barcode: true,
    autoGenerate: true,
  },
  {
    service: "IRL",
    prefix: "IRL",
    category: "general_post",
    trackingNamespace: true,
    moneyOrderNamespace: null,
    barcode: true,
    autoGenerate: true,
  },
  {
    service: "UMS",
    prefix: "UMS",
    category: "general_post",
    trackingNamespace: true,
    moneyOrderNamespace: null,
    barcode: true,
    autoGenerate: true,
  },
  {
    service: "VPX",
    prefix: "VPX",
    category: "general_post",
    trackingNamespace: true,
    moneyOrderNamespace: null,
    barcode: true,
    autoGenerate: true,
    deprecated: true,
    notes: "Deprecated in authoritative model; retained for compatibility in Phase-1.",
  },
] as const;

const SERVICE_BY_CODE = new Map(SERVICE_CATALOG.map((entry) => [entry.service, entry]));
const SERVICE_BY_PREFIX = new Map(SERVICE_CATALOG.map((entry) => [entry.prefix, entry]));

export function listCatalogServices(opts?: { includeDeprecated?: boolean }) {
  const includeDeprecated = opts?.includeDeprecated === true;
  return SERVICE_CATALOG.filter((entry) => includeDeprecated || entry.deprecated !== true);
}

export function getServiceByCode(service: unknown) {
  const normalized = String(service ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return SERVICE_BY_CODE.get(normalized) ?? null;
}

export function getServiceByPrefix(prefix: unknown) {
  const normalized = String(prefix ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return SERVICE_BY_PREFIX.get(normalized) ?? null;
}

export function getCatalogDiagnostics() {
  const deprecated = SERVICE_CATALOG.filter((entry) => entry.deprecated === true).map((entry) => entry.service);
  return {
    version: "phase1-foundation",
    serviceCount: SERVICE_CATALOG.length,
    deprecatedServices: deprecated,
    categories: {
      general_post: SERVICE_CATALOG.filter((entry) => entry.category === "general_post").map((entry) => entry.service),
      value_payable: SERVICE_CATALOG.filter((entry) => entry.category === "value_payable").map((entry) => entry.service),
      cod_articles: SERVICE_CATALOG.filter((entry) => entry.category === "cod_articles").map((entry) => entry.service),
    },
  };
}
