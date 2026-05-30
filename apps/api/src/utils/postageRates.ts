import {
  getActiveRateCards,
  resolveBasePostage,
  resolveInsuranceFee,
  resolveRegistrationFee,
  resolveValuePayableFee,
} from "../rateCards/index.js";
import type { ArticleCategory, PostalProduct, RouteType } from "../rateCards/types.js";

export interface PostageCalculatorInput {
  serviceCode: string;
  weightGrams: number | null | undefined;
  senderCity?: string;
  receiverCity?: string;
  articleCategory?: ArticleCategory;
  isTextbook?: boolean;
  isRegistered?: boolean;
  isValuePayable?: boolean;
  isInsured?: boolean;
  declaredValue?: number | null;
}

export type FeeComponentCode = "BASE_POSTAGE" | "REGISTRATION_FEE" | "VALUE_PAYABLE_FEE" | "INSURANCE_FEE";

export interface PostageCalculatorResult {
  articleCategory: string;
  postalProduct: string;
  weightGrams: number | null;
  chargeableWeightGrams: number | null;
  basePostageAmount: number | null;
  registrationFeeAmount: number | null;
  valuePayableFeeAmount: number | null;
  insuranceFeeAmount: number | null;
  totalOfficialPostalCharge: number | null;
  appliedComponents: FeeComponentCode[];
  missingComponents: FeeComponentCode[];
  matchedRateCards: string[];
  matchedSlabs: string[];
  warnings: string[];
  errors: string[];
}

function toCityToken(input?: string): string {
  const words = String(input ?? "").toUpperCase().match(/[A-Z]+/g) ?? [];
  return words[0] ?? "";
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
    case "ORDINARY":
      warnings.push("Defaulted service ORDINARY to LETTER category.");
      return "LETTER";
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
      warnings.push("COD mapped to UMS category for base evaluation. Additional COD component schedules may be unavailable.");
      return "UMS";
    default:
      errors.push(`Unsupported service code: ${serviceCode || "(empty)"}`);
      return null;
  }
}

function baseResult(input: PostageCalculatorInput): PostageCalculatorResult {
  return {
    articleCategory: String(input.articleCategory ?? "").trim().toUpperCase() || "UNKNOWN",
    postalProduct: "ORDINARY",
    weightGrams: input.weightGrams ?? null,
    chargeableWeightGrams: null,
    basePostageAmount: null,
    registrationFeeAmount: null,
    valuePayableFeeAmount: null,
    insuranceFeeAmount: null,
    totalOfficialPostalCharge: null,
    appliedComponents: [],
    missingComponents: [],
    matchedRateCards: [],
    matchedSlabs: [],
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

function inferPostalProduct(input: PostageCalculatorInput, warnings: string[], errors: string[]): PostalProduct | null {
  const raw = String(input.serviceCode ?? "").trim().toUpperCase();
  switch (raw) {
    case "ORDINARY":
    case "RGL":
    case "VPL":
    case "VPP":
    case "IRL":
    case "PAR":
    case "UMS":
    case "COD":
      return raw;
    case "":
      errors.push("Unsupported service code: (empty)");
      return null;
    default:
      warnings.push(`Unrecognized service code ${raw}; falling back to ORDINARY product mapping.`);
      return "ORDINARY";
  }
}

function shouldRequireRegistration(input: PostageCalculatorInput, product: PostalProduct): boolean {
  if (input.isRegistered === true) return true;
  return product === "RGL" || product === "VPL" || product === "VPP" || product === "IRL";
}

function shouldRequireValuePayable(input: PostageCalculatorInput, product: PostalProduct): boolean {
  if (input.isValuePayable === true) return true;
  return product === "VPL" || product === "VPP";
}

function shouldRequireInsurance(input: PostageCalculatorInput, product: PostalProduct): boolean {
  if (input.isInsured === true) return true;
  return product === "IRL";
}

function addMissingComponent(result: PostageCalculatorResult, component: FeeComponentCode, message: string) {
  if (!result.missingComponents.includes(component)) {
    result.missingComponents.push(component);
  }
  result.warnings.push(message);
}

function calculateTotal(result: PostageCalculatorResult): number | null {
  if (result.basePostageAmount === null) return null;
  if (result.missingComponents.length > 0) return null;
  return (result.basePostageAmount ?? 0)
    + (result.registrationFeeAmount ?? 0)
    + (result.valuePayableFeeAmount ?? 0)
    + (result.insuranceFeeAmount ?? 0);
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

  const product = inferPostalProduct(input, result.warnings, result.errors);
  if (!product) return result;

  result.articleCategory = category;
  result.postalProduct = product;

  if (category === "TEXT_BOOK" && roundedWeight > 50 && roundedWeight <= 250) {
    result.errors.push("Unsupported slab for TEXT_BOOK between 50g and 250g");
    return result;
  }

  const senderToken = toCityToken(input.senderCity);
  const receiverToken = toCityToken(input.receiverCity);
  const localConfirmed = Boolean(senderToken && receiverToken && senderToken === receiverToken);
  const routeType: RouteType = localConfirmed ? "LOCAL" : "CITY_TO_CITY";

  if (category === "UMS" && !localConfirmed) {
    result.warnings.push("UMS local route could not be confirmed; City to City tariff applied.");
  }

  const activeCards = getActiveRateCards();
  const base = resolveBasePostage({
    category,
    postalProduct: product,
    weightGrams: roundedWeight,
    routeType,
    cards: activeCards.basePostageCards,
  });

  if (!base) {
    addMissingComponent(result, "BASE_POSTAGE", `Missing BASE_POSTAGE schedule for ${product}/${category} at ${roundedWeight}g.`);
  } else {
    result.basePostageAmount = base.amount;
    result.chargeableWeightGrams = base.chargeableWeightGrams;
    result.appliedComponents.push("BASE_POSTAGE");
    result.matchedRateCards.push(base.matchedRateCardCode);
    result.matchedSlabs.push(base.matchedLabel);
  }

  const requireRegistration = shouldRequireRegistration(input, product);
  if (requireRegistration) {
    const reg = resolveRegistrationFee({
      category,
      postalProduct: product,
      cards: activeCards.registrationFeeCards,
    });
    if (!reg) {
      addMissingComponent(result, "REGISTRATION_FEE", `Missing REGISTRATION_FEE schedule for ${product}/${category}.`);
    } else {
      result.registrationFeeAmount = reg.amount;
      result.appliedComponents.push("REGISTRATION_FEE");
      result.matchedRateCards.push(reg.matchedRateCardCode);
      result.matchedSlabs.push(reg.matchedRule.label);
    }
  } else {
    result.registrationFeeAmount = 0;
  }

  const requireValuePayable = shouldRequireValuePayable(input, product);
  if (requireValuePayable) {
    const vp = resolveValuePayableFee({
      category,
      postalProduct: product,
      cards: activeCards.valuePayableFeeCards,
    });
    if (!vp) {
      addMissingComponent(result, "VALUE_PAYABLE_FEE", `Missing VALUE_PAYABLE_FEE schedule for ${product}/${category}.`);
    } else {
      result.valuePayableFeeAmount = vp.amount;
      result.appliedComponents.push("VALUE_PAYABLE_FEE");
      result.matchedRateCards.push(vp.matchedRateCardCode);
      result.matchedSlabs.push(vp.matchedRule.label);
    }
  } else {
    result.valuePayableFeeAmount = 0;
  }

  const requireInsurance = shouldRequireInsurance(input, product);
  if (requireInsurance) {
    const insurance = resolveInsuranceFee({
      category,
      postalProduct: product,
      cards: activeCards.insuranceFeeCards,
    });
    if (!insurance) {
      addMissingComponent(result, "INSURANCE_FEE", `Missing INSURANCE_FEE schedule for ${product}/${category}.`);
    } else {
      result.insuranceFeeAmount = insurance.amount;
      result.appliedComponents.push("INSURANCE_FEE");
      result.matchedRateCards.push(insurance.matchedRateCardCode);
      result.matchedSlabs.push(insurance.matchedRule.label);
    }
  } else {
    result.insuranceFeeAmount = 0;
  }

  if (product === "COD") {
    result.warnings.push("COD mapping is partially defined. Value payable and insurance schedules are not guessed when missing.");
  }

  result.totalOfficialPostalCharge = calculateTotal(result);
  if (result.totalOfficialPostalCharge === null && result.missingComponents.length > 0) {
    result.errors.push("Total official postal charge cannot be fully finalized because one or more required components are missing.");
  }

  result.matchedRateCards = Array.from(new Set(result.matchedRateCards));
  result.appliedComponents = Array.from(new Set(result.appliedComponents));

  return result;
}
