import assert from "node:assert/strict";
import { evaluateBookingRecommendation } from "./bookingRecommendationService.js";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: "Lahore sender recommends drop option",
    run() {
      const result = evaluateBookingRecommendation({
        senderCity: "Lahore",
        totalArticles: 12,
        totalActualWeightGrams: 1200,
        totalChargeableWeightGrams: 1200,
        serviceCodes: ["RGL"],
        perArticleWeightsGrams: [100, 120, 90],
      });

      assert.equal(result.recommendedOption, "DROP_AT_COLLECTION_POINT");
      assert.equal(result.requestPreviewAllowed, true);
    },
  },
  {
    name: "Outside Lahore/Sahiwal with 10+ recommends pickup planning",
    run() {
      const result = evaluateBookingRecommendation({
        senderCity: "Karachi",
        totalArticles: 10,
        totalActualWeightGrams: 1000,
        totalChargeableWeightGrams: 1000,
        serviceCodes: ["RGL"],
        perArticleWeightsGrams: [80, 90, 100, 110],
      });

      assert.equal(result.recommendedOption, "PICKUP_TO_HUB_PLANNING");
      assert.equal(result.eligibility, "recommended");
    },
  },
  {
    name: "Under 10 articles returns advisory option",
    run() {
      const result = evaluateBookingRecommendation({
        senderCity: "Karachi",
        totalArticles: 5,
        totalActualWeightGrams: 500,
        totalChargeableWeightGrams: 500,
        serviceCodes: ["RGL"],
        perArticleWeightsGrams: [90, 95, 100],
      });

      assert.equal(result.recommendedOption, "DIRECT_COURIER_OR_SELF_DROP_ADVISORY");
      assert.equal(result.eligibility, "review_required");
    },
  },
  {
    name: "Over 1kg article triggers blocker and not recommended",
    run() {
      const result = evaluateBookingRecommendation({
        senderCity: "Karachi",
        totalArticles: 20,
        totalActualWeightGrams: 8000,
        totalChargeableWeightGrams: 8000,
        serviceCodes: ["RGL"],
        perArticleWeightsGrams: [1200, 200, 180],
      });

      assert.equal(result.eligibility, "not_recommended");
      assert.equal(result.blockers.includes("OVER_PHASE_LIMIT"), true);
      assert.equal(result.requestPreviewAllowed, false);
    },
  },
  {
    name: "Value payable services trigger Pakistan Post final-delivery guard",
    run() {
      const result = evaluateBookingRecommendation({
        senderCity: "Sahiwal",
        totalArticles: 8,
        totalActualWeightGrams: 700,
        totalChargeableWeightGrams: 700,
        serviceCodes: ["VPL", "RGL"],
        perArticleWeightsGrams: [80, 85, 90],
      });

      assert.equal(result.valuePayableGuard, true);
      assert.equal(
        result.advisoryNotes.some((entry) => entry.includes("Final delivery must remain through Pakistan Post.")),
        true,
      );
    },
  },
];

function runAll() {
  let passed = 0;
  for (const test of tests) {
    try {
      test.run();
      passed += 1;
      console.log(`PASS ${test.name}`);
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      throw error;
    }
  }
  console.log(`bookingRecommendationService.test: ${passed}/${tests.length} passed`);
}

runAll();
