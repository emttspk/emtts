import { api } from "./api";

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

export const FALLBACK_SERVICE_CATALOG: ServiceCatalogEntry[] = [
  { service: "RGL", prefix: "RGL", category: "general_post", trackingNamespace: true, moneyOrderNamespace: null, barcode: true, autoGenerate: true },
  { service: "IRL", prefix: "IRL", category: "general_post", trackingNamespace: true, moneyOrderNamespace: null, barcode: true, autoGenerate: true },
  { service: "UMS", prefix: "UMS", category: "general_post", trackingNamespace: true, moneyOrderNamespace: null, barcode: true, autoGenerate: true },
  { service: "VPL", prefix: "VPL", category: "value_payable", trackingNamespace: true, moneyOrderNamespace: "MOS", barcode: true, autoGenerate: true },
  { service: "VPP", prefix: "VPP", category: "value_payable", trackingNamespace: true, moneyOrderNamespace: "MOS", barcode: true, autoGenerate: true },
  { service: "PAR", prefix: "PAR", category: "general_post", trackingNamespace: true, moneyOrderNamespace: null, barcode: true, autoGenerate: true },
  { service: "COD", prefix: "COD", category: "cod_articles", trackingNamespace: true, moneyOrderNamespace: "UMO", barcode: true, autoGenerate: true },
];

export async function fetchServiceCatalog() {
  try {
    const response = await api<{ services: ServiceCatalogEntry[] }>("/api/catalog/services");
    return Array.isArray(response.services) && response.services.length > 0
      ? response.services
      : FALLBACK_SERVICE_CATALOG;
  } catch {
    return FALLBACK_SERVICE_CATALOG;
  }
}

export function servicesByCategory(services: ServiceCatalogEntry[], category: ServiceCategory) {
  return services
    .filter((entry) => entry.category === category && entry.deprecated !== true)
    .map((entry) => entry.service);
}
