import assert from "node:assert/strict";
import { buildPostageComparisonSummary } from "./postageComparisonService.js";

const summary = buildPostageComparisonSummary(
  {
    totalArticles: 12,
    totalWeightGrams: 1800,
    averageWeightGrams: 150,
    totalPakistanPostPostage: 2800,
    hasValuePayable: false,
    perArticle: [],
  },
  2000,
);

assert.equal(summary.recommendation, "PAKISTAN_POST_ROUTE_RECOMMENDED");
assert.equal(summary.savingAmount > 0, true);
console.log("postageComparisonService.test: PASS");
