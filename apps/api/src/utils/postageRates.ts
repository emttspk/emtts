export type ArticleCategory = "LETTER" | "PRINTED_PAPER" | "TEXT_BOOK" | "PARCEL" | "UMS";

export interface PostageCalculatorInput {
  serviceCode: string;
  weightGrams: number | null | undefined;
  senderCity?: string;
  receiverCity?: string;
  articleCategory?: ArticleCategory;
  isTextbook?: boolean;
}

export interface PostageCalculatorResult {
  articleCategory: string;
  postalProduct: string;
  weightGrams: number | null;
  chargeableWeightGrams: number | null;
  postageAmount: number | null;
  matchedSlab: string | null;
  warnings: string[];
  errors: string[];
}

type Slab = {
  maxWeightGrams: number;
  amount: number;
  label: string;
};

const LETTER_SLABS: Slab[] = [
  { maxWeightGrams: 20, amount: 30, label: "Not exceeding 20g" },
  { maxWeightGrams: 50, amount: 60, label: "Exceeding 20g to 50g" },
  { maxWeightGrams: 100, amount: 75, label: "Exceeding 50g to 100g" },
  { maxWeightGrams: 250, amount: 120, label: "Exceeding 100g to 250g" },
  { maxWeightGrams: 500, amount: 150, label: "Exceeding 250g to 500g" },
  { maxWeightGrams: 1000, amount: 230, label: "Exceeding 500g to 1000g" },
  { maxWeightGrams: 1500, amount: 300, label: "Exceeding 1000g to 1500g" },
  { maxWeightGrams: 2000, amount: 380, label: "Exceeding 1500g to 2000g" },
];

const PRINTED_PAPER_SLABS: Slab[] = [
  { maxWeightGrams: 50, amount: 20, label: "Not exceeding 50g" },
  { maxWeightGrams: 250, amount: 40, label: "Exceeding 50g to 250g" },
  { maxWeightGrams: 1000, amount: 60, label: "Exceeding 250g to 1000g" },
  { maxWeightGrams: 2000, amount: 100, label: "Exceeding 1000g to 2000g" },
];

const TEXT_BOOK_SLABS: Slab[] = [
  { maxWeightGrams: 50, amount: 40, label: "Not exceeding 50g" },
  { maxWeightGrams: 1000, amount: 80, label: "Exceeding 250g to 1000g" },
  { maxWeightGrams: 2000, amount: 120, label: "Exceeding 1000g to 2000g" },
  { maxWeightGrams: 3000, amount: 170, label: "Exceeding 2000g to 3000g" },
  { maxWeightGrams: 4000, amount: 210, label: "Exceeding 3000g to 4000g" },
  { maxWeightGrams: 5000, amount: 270, label: "Exceeding 4000g to 5000g" },
  { maxWeightGrams: 6000, amount: 300, label: "Exceeding 5000g to 6000g" },
  { maxWeightGrams: 7000, amount: 340, label: "Exceeding 6000g to 7000g" },
];

const PARCEL_SLABS: Slab[] = [
  { maxWeightGrams: 1000, amount: 150, label: "Not exceeding 1kg" },
  { maxWeightGrams: 3000, amount: 270, label: "Exceeding 1kg to 3kg" },
  { maxWeightGrams: 5000, amount: 380, label: "Exceeding 3kg to 5kg" },
  { maxWeightGrams: 10000, amount: 570, label: "Exceeding 5kg to 10kg" },
  { maxWeightGrams: 15000, amount: 750, label: "Exceeding 10kg to 15kg" },
  { maxWeightGrams: 20000, amount: 940, label: "Exceeding 15kg to 20kg" },
  { maxWeightGrams: 25000, amount: 1130, label: "Exceeding 20kg to 25kg" },
  { maxWeightGrams: 30000, amount: 1320, label: "Exceeding 25kg to 30kg" },
];

function toCityToken(input?: string): string {
  const words = String(input ?? "").toUpperCase().match(/[A-Z]+/g) ?? [];
  return words[0] ?? "";
}

function findSlab(slabs: Slab[], weightGrams: number): Slab | null {
  return slabs.find((slab) => weightGrams <= slab.maxWeightGrams) ?? null;
}

function inferCategory(input: PostageCalculatorInput, warnings: string[], errors: string[]): ArticleCategory | null {
  const explicitCategory = String(input.articleCategory ?? "").trim().toUpperCase();
  if (explicitCategory) {
    if (explicitCategory === "LETTER" || explicitCategory === "PRINTED_PAPER" || explicitCategory === "TEXT_BOOK" || explicitCategory === "PARCEL" || explicitCategory === "UMS") {
      return explicitCategory as ArticleCategory;
    }
    errors.push(`Unsupported category: ${explicitCategory}`);
    return null;
  }

  if (input.isTextbook) {
    return "TEXT_BOOK";
  }

  const serviceCode = String(input.serviceCode ?? "").trim().toUpperCase();
  switch (serviceCode) {
    case "RGL":
    case "VPL":
    case "IRL":
      warnings.push(`Defaulted service ${serviceCode} to LETTER category.`);
      return "LETTER";
    case "PAR":
    case "VPP":
      warnings.push(`Defaulted service ${serviceCode} to PARCEL category.`);
      return "PARCEL";
    case "UMS":
      return "UMS";
    case "COD":
      warnings.push("COD mapped to UMS quote category for Phase 1 estimate. Verify final Pakistan Post booking product during later workflow.");
      return "UMS";
    default:
      errors.push(`Unsupported service code: ${serviceCode || "(empty)"}`);
      return null;
  }
}

function baseResult(input: PostageCalculatorInput): PostageCalculatorResult {
  return {
    articleCategory: String(input.articleCategory ?? "").trim().toUpperCase() || "UNKNOWN",
    postalProduct: String(input.serviceCode ?? "").trim().toUpperCase() || "UNKNOWN",
    weightGrams: input.weightGrams ?? null,
    chargeableWeightGrams: null,
    postageAmount: null,
    matchedSlab: null,
    warnings: [],
    errors: [],
  };
}

function validateWeight(value: number | null | undefined, errors: string[]): number | null {
  if (value === null || value === undefined || String(value).trim() === "") {
    errors.push("Missing weight");
    return null;
  }
  if (!Number.isFinite(value)) {
    errors.push("Invalid weight");
    return null;
  }
  if (value <= 0) {
    errors.push("Invalid weight");
    return null;
  }
  return value;
}

function calculateUmsRate(weightGrams: number, isLocal: boolean): Pick<PostageCalculatorResult, "chargeableWeightGrams" | "postageAmount" | "matchedSlab"> {
  if (weightGrams <= 250) {
    return {
      chargeableWeightGrams: 250,
      postageAmount: isLocal ? 90 : 150,
      matchedSlab: isLocal ? "UMS Local up to 250g" : "UMS City to City up to 250g",
    };
  }

  if (weightGrams <= 500) {
    return {
      chargeableWeightGrams: 500,
      postageAmount: isLocal ? 110 : 230,
      matchedSlab: isLocal ? "UMS Local up to 500g" : "UMS City to City up to 500g",
    };
  }

  const additionalBlocks = Math.ceil((weightGrams - 500) / 500);
  const chargeableWeightGrams = 500 + (additionalBlocks * 500);
  const incremental = isLocal ? 45 : 75;
  const base = isLocal ? 110 : 230;

  return {
    chargeableWeightGrams,
    postageAmount: base + (additionalBlocks * incremental),
    matchedSlab: isLocal
      ? `UMS Local base 500g + ${additionalBlocks} additional 500g block(s)`
      : `UMS City to City base 500g + ${additionalBlocks} additional 500g block(s)`,
  };
}

export function calculatePostage(input: PostageCalculatorInput): PostageCalculatorResult {
  const result = baseResult(input);
  const weightGrams = validateWeight(input.weightGrams, result.errors);
  if (weightGrams === null) {
    return result;
  }

  const roundedWeight = Math.ceil(weightGrams);
  result.weightGrams = roundedWeight;

  const category = inferCategory(input, result.warnings, result.errors);
  if (!category) {
    return result;
  }

  result.articleCategory = category;
  const serviceCode = String(input.serviceCode ?? "").trim().toUpperCase();
  result.postalProduct = serviceCode || category;

  if (category === "LETTER") {
    const slab = findSlab(LETTER_SLABS, roundedWeight);
    if (!slab) {
      result.errors.push("Unsupported slab for LETTER");
      return result;
    }
    result.chargeableWeightGrams = slab.maxWeightGrams;
    result.postageAmount = slab.amount;
    result.matchedSlab = slab.label;
    return result;
  }

  if (category === "PRINTED_PAPER") {
    const slab = findSlab(PRINTED_PAPER_SLABS, roundedWeight);
    if (!slab) {
      result.errors.push("Unsupported slab for PRINTED_PAPER");
      return result;
    }
    result.chargeableWeightGrams = slab.maxWeightGrams;
    result.postageAmount = slab.amount;
    result.matchedSlab = slab.label;
    return result;
  }

  if (category === "TEXT_BOOK") {
    if (roundedWeight > 50 && roundedWeight <= 250) {
      result.errors.push("Unsupported slab for TEXT_BOOK between 50g and 250g");
      return result;
    }
    const slab = findSlab(TEXT_BOOK_SLABS, roundedWeight);
    if (!slab) {
      result.errors.push("Unsupported slab for TEXT_BOOK");
      return result;
    }
    result.chargeableWeightGrams = slab.maxWeightGrams;
    result.postageAmount = slab.amount;
    result.matchedSlab = slab.label;
    return result;
  }

  if (category === "PARCEL") {
    const slab = findSlab(PARCEL_SLABS, roundedWeight);
    if (!slab) {
      result.errors.push("Unsupported slab for PARCEL");
      return result;
    }
    result.chargeableWeightGrams = slab.maxWeightGrams;
    result.postageAmount = slab.amount;
    result.matchedSlab = slab.label;
    return result;
  }

  const senderToken = toCityToken(input.senderCity);
  const receiverToken = toCityToken(input.receiverCity);
  const localConfirmed = Boolean(senderToken && receiverToken && senderToken === receiverToken);
  const isLocal = localConfirmed;

  if (!localConfirmed) {
    result.warnings.push("UMS local route could not be confirmed; City to City tariff applied.");
  }

  const ums = calculateUmsRate(roundedWeight, isLocal);
  result.chargeableWeightGrams = ums.chargeableWeightGrams;
  result.postageAmount = ums.postageAmount;
  result.matchedSlab = ums.matchedSlab;

  return result;
}
