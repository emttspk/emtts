export type PostageComparisonRecommendation =
  | "DIRECT_COURIER_OR_SELF_DROP"
  | "PAKISTAN_POST_ROUTE_RECOMMENDED"
  | "COURIER_BUNDLE_ROUTE";

export type PostageComparisonInput = {
  articleCount: number;
  totalWeightGrams: number;
  averageWeightGrams: number;
  hasValuePayable: boolean;
  pakistanPostTotal: number;
  courierTotal: number;
};

export type PostageComparisonOutput = {
  recommendation: PostageComparisonRecommendation;
  rationale: string[];
  savingAmount: number;
};

export function evaluatePostageComparisonRules(input: PostageComparisonInput): PostageComparisonOutput {
  const savingAmount = Math.max(0, input.courierTotal - input.pakistanPostTotal);
  const rationale: string[] = [];

  if (input.hasValuePayable) {
    rationale.push("VPL/VPP/COD shipments must remain Pakistan Post for final delivery.");
  }

  if (input.articleCount < 10) {
    rationale.push("Article count is under 10, so direct courier or self-drop is recommended.");
    return { recommendation: "DIRECT_COURIER_OR_SELF_DROP", rationale, savingAmount };
  }

  if (input.averageWeightGrams < 250 && savingAmount > 0) {
    rationale.push("10+ articles with average weight under 250g and measurable savings favor Pakistan Post route.");
    return { recommendation: "PAKISTAN_POST_ROUTE_RECOMMENDED", rationale, savingAmount };
  }

  rationale.push("Bundle route comparison favors courier planning for this payload.");
  return { recommendation: "COURIER_BUNDLE_ROUTE", rationale, savingAmount };
}
