export type BookingRecommendationOption =
  | "DROP_AT_COLLECTION_POINT"
  | "PICKUP_TO_HUB_PLANNING"
  | "DIRECT_COURIER_OR_SELF_DROP_ADVISORY";

export type BookingRecommendationEligibility = "recommended" | "review_required" | "not_recommended";

export type BookingRecommendationOutput = {
  recommendedOption: BookingRecommendationOption;
  eligibility: BookingRecommendationEligibility;
  badges: string[];
  blockers: string[];
  advisoryNotes: string[];
  valuePayableGuard: boolean;
  requestPreviewAllowed: boolean;
};

export type BookingRecommendationInput = {
  senderCity?: string | null;
  totalArticles: number;
  totalActualWeightGrams: number;
  totalChargeableWeightGrams: number;
  serviceCodes: string[];
  perArticleWeightsGrams: Array<number | null | undefined>;
};

function normalizeCity(city: string | null | undefined): string {
  return String(city ?? "").trim().toLowerCase();
}

function normalizeServiceCode(code: string): string {
  return String(code ?? "").trim().toUpperCase();
}

export function evaluateBookingRecommendation(input: BookingRecommendationInput): BookingRecommendationOutput {
  const city = normalizeCity(input.senderCity);
  const totalArticles = Number.isFinite(input.totalArticles) ? Math.max(0, Math.trunc(input.totalArticles)) : 0;
  const weights = (input.perArticleWeightsGrams ?? []).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  const totalWeightFromRows = weights.reduce((sum, value) => sum + value, 0);
  const averageWeightGrams = weights.length > 0
    ? totalWeightFromRows / weights.length
    : (totalArticles > 0 ? Math.max(0, input.totalActualWeightGrams) / totalArticles : 0);

  const hasOverPhaseLimitArticle = weights.some((weight) => weight > 1000);
  const isDropCity = city === "lahore" || city === "sahiwal";
  const hasValuePayableService = (input.serviceCodes ?? []).some((code) => {
    const normalized = normalizeServiceCode(code);
    return normalized === "VPL" || normalized === "VPP" || normalized === "COD";
  });

  const badges: string[] = [];
  const blockers: string[] = [];
  const advisoryNotes: string[] = [];

  if (averageWeightGrams > 0 && averageWeightGrams < 100) {
    badges.push("LIGHT_SHIPMENT_BEST_FIT");
  }

  if (averageWeightGrams > 0 && averageWeightGrams < 250) {
    badges.push("PK_POST_AGGREGATION_RECOMMENDED");
  }

  let eligibility: BookingRecommendationEligibility = "recommended";

  if (averageWeightGrams >= 250 && averageWeightGrams < 1000) {
    eligibility = "review_required";
    badges.push("REVIEW_REQUIRED");
    advisoryNotes.push("Average article weight is between 250g and 1kg. Manual review is advised before submission.");
  }

  if (hasOverPhaseLimitArticle) {
    eligibility = "not_recommended";
    blockers.push("OVER_PHASE_LIMIT");
    advisoryNotes.push("One or more articles exceed 1kg and are outside current aggregator phase limits.");
  }

  let recommendedOption: BookingRecommendationOption;
  if (isDropCity) {
    recommendedOption = "DROP_AT_COLLECTION_POINT";
    advisoryNotes.push("Sender city is Lahore/Sahiwal, so drop-at-collection-point is available.");
  } else if (totalArticles >= 10) {
    recommendedOption = "PICKUP_TO_HUB_PLANNING";
    advisoryNotes.push("For outside Lahore/Sahiwal with 10 or more articles, pickup-to-hub planning may be suitable.");
  } else {
    recommendedOption = "DIRECT_COURIER_OR_SELF_DROP_ADVISORY";
    advisoryNotes.push("For fewer than 10 articles, direct courier or self-drop may be more practical.");
    if (eligibility === "recommended") {
      eligibility = "review_required";
    }
  }

  advisoryNotes.push("Total bundle weight is planning information only and does not replace per-article postage basis.");
  advisoryNotes.push("Postage remains calculated per individual article.");

  if (hasValuePayableService) {
    advisoryNotes.push("Final delivery must remain through Pakistan Post.");
    advisoryNotes.push("If courier is used, it is pickup-to-hub planning only and not the final carrier.");
  }

  return {
    recommendedOption,
    eligibility,
    badges,
    blockers,
    advisoryNotes,
    valuePayableGuard: hasValuePayableService,
    requestPreviewAllowed: blockers.length === 0,
  };
}
