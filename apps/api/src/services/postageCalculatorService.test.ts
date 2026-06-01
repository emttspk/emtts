import assert from "node:assert/strict";
import { buildPostageCalculatorSummary } from "./postageCalculatorService.js";

const summary = buildPostageCalculatorSummary([
  { serviceCode: "RGL", weightGrams: 120 },
  { serviceCode: "VPL", weightGrams: 220 },
]);

assert.equal(summary.totalArticles, 2);
assert.equal(summary.totalWeightGrams, 340);
assert.equal(summary.hasValuePayable, true);
assert.equal(summary.totalPakistanPostPostage > 0, true);
console.log("postageCalculatorService.test: PASS");
