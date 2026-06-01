import {
  evaluatePostageComparisonRules,
  type PostageComparisonOutput,
} from "../utils/postageComparisonRules.js";
import type { PostageCalculatorSummary } from "./postageCalculatorService.js";

export type PostageComparisonSummary = {
  pakistanPostTotal: number;
  courierTotal: number;
  savingAmount: number;
  recommendation: PostageComparisonOutput["recommendation"];
  rationale: string[];
};

export function buildPostageComparisonSummary(
  summary: PostageCalculatorSummary,
  courierRatePerKg: number,
): PostageComparisonSummary {
  const chargeableKg = Math.max(1, Math.ceil(summary.totalWeightGrams / 1000));
  const courierTotal = chargeableKg * courierRatePerKg;
  const rule = evaluatePostageComparisonRules({
    articleCount: summary.totalArticles,
    totalWeightGrams: summary.totalWeightGrams,
    averageWeightGrams: summary.averageWeightGrams,
    hasValuePayable: summary.hasValuePayable,
    pakistanPostTotal: summary.totalPakistanPostPostage,
    courierTotal,
  });
  return {
    pakistanPostTotal: summary.totalPakistanPostPostage,
    courierTotal,
    savingAmount: rule.savingAmount,
    recommendation: rule.recommendation,
    rationale: rule.rationale,
  };
}
