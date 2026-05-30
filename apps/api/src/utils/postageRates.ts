export type PostalProduct = "UMS" | "COD" | "RGL" | "VPL" | "VPP" | "IRL" | "PAR";

export type CalculatorArticleCategory =
  | "Letters"
  | "Printed Papers"
  | "Printed Papers Text Books"
  | "Parcels"
  | "UMS Local"
  | "UMS City to City";

export interface PostageCalculatorInput {
  serviceCode: string;
  weightGrams: number | null | undefined;
  senderCity?: string;
  receiverCity?: string;
  articleCategory?: string;
  isTextbook?: boolean;
}

type TariffSlab = {
  minWeightGrams: number;
  maxWeightGrams: number;
  amount: number;
  label: string;
};

export interface PostageCalculatorResult {
  articleCategory: string;
  postalProduct: string;
  weightGrams: number | null;
  chargeableWeightGrams: number | null;
  postageAmount: number | null;
  matchedSlab: string | null;
  warnings: string[];
  errors: string[];
  // Compatibility fields consumed by existing aggregator draft module.
  basePostageAmount: number | null;
  registrationFeeAmount: number | null;
  valuePayableFeeAmount: number | null;
  insuranceFeeAmount: number | null;
  totalOfficialPostalCharge: number | null;
  appliedComponents: string[];
  missingComponents: string[];
  matchedRateCards: string[];
  matchedSlabs: string[];
}

const LETTERS_SLABS: TariffSlab[] = [
  { minWeightGrams: 1, maxWeightGrams: 20, amount: 30, label: "1-20g" },
  { minWeightGrams: 21, maxWeightGrams: 50, amount: 60, label: "21-50g" },
  { minWeightGrams: 51, maxWeightGrams: 100, amount: 75, label: "51-100g" },
  { minWeightGrams: 101, maxWeightGrams: 250, amount: 100, label: "101-250g" },
  { minWeightGrams: 251, maxWeightGrams: 500, amount: 150, label: "251-500g" },
  { minWeightGrams: 501, maxWeightGrams: 1000, amount: 230, label: "501-1000g" },
  { minWeightGrams: 1001, maxWeightGrams: 2000, amount: 380, label: "1001-2000g" },
];

const PRINTED_PAPERS_SLABS: TariffSlab[] = [
  { minWeightGrams: 1, maxWeightGrams: 50, amount: 20, label: "1-50g" },
  { minWeightGrams: 51, maxWeightGrams: 100, amount: 35, label: "51-100g" },
  { minWeightGrams: 101, maxWeightGrams: 250, amount: 60, label: "101-250g" },
  { minWeightGrams: 251, maxWeightGrams: 500, amount: 90, label: "251-500g" },
  { minWeightGrams: 501, maxWeightGrams: 1000, amount: 140, label: "501-1000g" },
  { minWeightGrams: 1001, maxWeightGrams: 2000, amount: 220, label: "1001-2000g" },
];

const TEXT_BOOK_SLABS: TariffSlab[] = [
  { minWeightGrams: 1, maxWeightGrams: 50, amount: 20, label: "1-50g" },
  { minWeightGrams: 251, maxWeightGrams: 500, amount: 60, label: "251-500g" },
  { minWeightGrams: 501, maxWeightGrams: 1000, amount: 100, label: "501-1000g" },
  { minWeightGrams: 1001, maxWeightGrams: 2000, amount: 160, label: "1001-2000g" },
];

const PARCEL_SLABS: TariffSlab[] = [
  { minWeightGrams: 1, maxWeightGrams: 500, amount: 110, label: "1-500g" },
  { minWeightGrams: 501, maxWeightGrams: 1000, amount: 150, label: "501-1000g" },
  { minWeightGrams: 1001, maxWeightGrams: 2000, amount: 230, label: "1001-2000g" },
  { minWeightGrams: 2001, maxWeightGrams: 5000, amount: 450, label: "2001-5000g" },
];

const UMS_LOCAL_SLABS: TariffSlab[] = [
  { minWeightGrams: 1, maxWeightGrams: 250, amount: 90, label: "1-250g" },
  { minWeightGrams: 251, maxWeightGrams: 500, amount: 110, label: "251-500g" },
  { minWeightGrams: 501, maxWeightGrams: 1000, amount: 155, label: "501-1000g" },
  { minWeightGrams: 1001, maxWeightGrams: 2000, amount: 235, label: "1001-2000g" },
];

const UMS_CITY_TO_CITY_SLABS: TariffSlab[] = [
  { minWeightGrams: 1, maxWeightGrams: 250, amount: 150, label: "1-250g" },
  { minWeightGrams: 251, maxWeightGrams: 500, amount: 230, label: "251-500g" },
  { minWeightGrams: 501, maxWeightGrams: 1000, amount: 305, label: "501-1000g" },
  { minWeightGrams: 1001, maxWeightGrams: 2000, amount: 420, label: "1001-2000g" },
];

function normalizeCity(value?: string): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPositiveWeight(value: number | null | undefined, errors: string[]): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    errors.push("Missing weight");
    return null;
  }
  if (!Number.isFinite(value)) {
    errors.push("Invalid weight");
    return null;
  }
  if (value < 0) {
    errors.push("Negative weight");
    return null;
  }
  if (value === 0) {
    errors.push("Invalid weight");
    return null;
  }
  return Math.ceil(value);
}

function resolvePostalProduct(serviceCode: string, errors: string[]): PostalProduct | null {
  const normalized = serviceCode.trim().toUpperCase();
  switch (normalized) {
    case "UMS":
    case "COD":
    case "RGL":
    case "VPL":
    case "VPP":
    case "IRL":
    case "PAR":
      return normalized;
    default:
      errors.push(`Unsupported service: ${normalized || "(empty)"}`);
      return null;
  }
}

function resolveCategory(
  input: PostageCalculatorInput,
  postalProduct: PostalProduct,
  warnings: string[],
): CalculatorArticleCategory {
  const explicit = String(input.articleCategory ?? "").trim().toUpperCase();
  const sender = normalizeCity(input.senderCity);
  const receiver = normalizeCity(input.receiverCity);
  const isLocal = Boolean(sender && receiver && sender === receiver);

  if (explicit === "LETTERS") return "Letters";
  if (explicit === "PRINTED PAPERS") return "Printed Papers";
  if (explicit === "PRINTED PAPERS TEXT BOOKS") return "Printed Papers Text Books";
  if (explicit === "PARCELS") return "Parcels";
  if (explicit === "UMS LOCAL") return "UMS Local";
  if (explicit === "UMS CITY TO CITY") return "UMS City to City";

  if (input.isTextbook) {
    return "Printed Papers Text Books";
  }

  if (postalProduct === "UMS" || postalProduct === "COD") {
    if (!sender || !receiver) {
      warnings.push("UMS local vs city-to-city could not be confirmed from city input. City-to-city rate applied.");
      return "UMS City to City";
    }
    return isLocal ? "UMS Local" : "UMS City to City";
  }

  if (postalProduct === "PAR" || postalProduct === "VPP") {
    return "Parcels";
  }

  return "Letters";
}

function findSlab(slabs: TariffSlab[], weightGrams: number): TariffSlab | null {
  for (const slab of slabs) {
    if (weightGrams >= slab.minWeightGrams && weightGrams <= slab.maxWeightGrams) {
      return slab;
    }
  }
  return null;
}

function slabsForCategory(category: CalculatorArticleCategory): TariffSlab[] {
  switch (category) {
    case "Letters":
      return LETTERS_SLABS;
    case "Printed Papers":
      return PRINTED_PAPERS_SLABS;
    case "Printed Papers Text Books":
      return TEXT_BOOK_SLABS;
    case "Parcels":
      return PARCEL_SLABS;
    case "UMS Local":
      return UMS_LOCAL_SLABS;
    case "UMS City to City":
      return UMS_CITY_TO_CITY_SLABS;
  }
}

function emptyResult(input: PostageCalculatorInput): PostageCalculatorResult {
  return {
    articleCategory: String(input.articleCategory ?? "").trim() || "UNKNOWN",
    postalProduct: String(input.serviceCode ?? "").trim().toUpperCase() || "UNKNOWN",
    weightGrams: input.weightGrams ?? null,
    chargeableWeightGrams: null,
    postageAmount: null,
    matchedSlab: null,
    warnings: [],
    errors: [],
    basePostageAmount: null,
    registrationFeeAmount: 0,
    valuePayableFeeAmount: 0,
    insuranceFeeAmount: 0,
    totalOfficialPostalCharge: null,
    appliedComponents: [],
    missingComponents: [],
    matchedRateCards: ["PHASE1_STATIC_POSTAGE"],
    matchedSlabs: [],
  };
}

export function calculatePostage(input: PostageCalculatorInput): PostageCalculatorResult {
  const result = emptyResult(input);
  const weight = toPositiveWeight(input.weightGrams, result.errors);
  if (weight === null) {
    return result;
  }

  result.weightGrams = weight;

  const postalProduct = resolvePostalProduct(String(input.serviceCode ?? ""), result.errors);
  if (!postalProduct) {
    return result;
  }
  result.postalProduct = postalProduct;

  const category = resolveCategory(input, postalProduct, result.warnings);
  result.articleCategory = category;

  if (category === "Printed Papers Text Books" && weight > 50 && weight <= 250) {
    result.errors.push("Unsupported slab: Printed Papers Text Books above 50g and not exceeding 250g.");
    return result;
  }

  if (postalProduct === "VPL" || postalProduct === "VPP" || postalProduct === "COD") {
    result.warnings.push("VPL, VPP, and COD remain Pakistan Post final-delivery products in this quote module.");
  }

  const slab = findSlab(slabsForCategory(category), weight);
  if (!slab) {
    result.errors.push(`Unsupported slab for ${category} at ${weight}g.`);
    return result;
  }

  result.chargeableWeightGrams = slab.maxWeightGrams;
  result.postageAmount = slab.amount;
  result.matchedSlab = slab.label;
  result.basePostageAmount = slab.amount;
  result.totalOfficialPostalCharge = slab.amount;
  result.appliedComponents = ["POSTAGE"];
  result.matchedSlabs = [slab.label];

  return result;
}
