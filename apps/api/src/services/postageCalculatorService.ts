import { calculatePostage } from "../utils/postageRates.js";
import type { PostageUploadRow } from "../utils/postageUploadValidation.js";

export type PostageCalculatorSummary = {
  totalArticles: number;
  totalWeightGrams: number;
  averageWeightGrams: number;
  totalPakistanPostPostage: number;
  hasValuePayable: boolean;
  perArticle: Array<{
    serviceCode: string;
    weightGrams: number;
    postageAmount: number;
    matchedSlab: string | null;
  }>;
};

export function buildPostageCalculatorSummary(rows: PostageUploadRow[]): PostageCalculatorSummary {
  const perArticle = rows.map((row) => {
    const result = calculatePostage({
      serviceCode: row.serviceCode,
      weightGrams: row.weightGrams,
      senderCity: row.senderCity,
      receiverCity: row.receiverCity,
      articleCategory: row.articleCategory,
    });
    return {
      serviceCode: row.serviceCode,
      weightGrams: row.weightGrams,
      postageAmount: result.postageAmount ?? 0,
      matchedSlab: result.matchedSlab,
    };
  });

  const totalWeightGrams = perArticle.reduce((sum, row) => sum + row.weightGrams, 0);
  const totalPakistanPostPostage = perArticle.reduce((sum, row) => sum + row.postageAmount, 0);
  const hasValuePayable = rows.some((row) => ["VPL", "VPP", "COD"].includes(row.serviceCode));

  return {
    totalArticles: perArticle.length,
    totalWeightGrams,
    averageWeightGrams: perArticle.length > 0 ? totalWeightGrams / perArticle.length : 0,
    totalPakistanPostPostage,
    hasValuePayable,
    perArticle,
  };
}
