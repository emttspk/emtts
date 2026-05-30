import assert from "node:assert/strict";
import { calculatePostage } from "./postageRates.js";
import { buildBookingQuoteSummary } from "../services/bookingQuoteService.js";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: "LETTER slab boundaries",
    run() {
      assert.equal(calculatePostage({ serviceCode: "RGL", weightGrams: 20 }).postageAmount, 30);
      assert.equal(calculatePostage({ serviceCode: "RGL", weightGrams: 21 }).postageAmount, 60);
      assert.equal(calculatePostage({ serviceCode: "RGL", weightGrams: 50 }).postageAmount, 60);
      assert.equal(calculatePostage({ serviceCode: "RGL", weightGrams: 51 }).postageAmount, 75);
      assert.equal(calculatePostage({ serviceCode: "RGL", weightGrams: 2000 }).postageAmount, 380);
    },
  },
  {
    name: "RGL maps to Letters category",
    run() {
      const rgl = calculatePostage({ serviceCode: "RGL", weightGrams: 20 });
      assert.equal(rgl.articleCategory, "Letters");
      assert.equal(rgl.postageAmount, 30);
    },
  },
  {
    name: "TEXT_BOOK keeps 50g-250g gap unsupported",
    run() {
      const gap = calculatePostage({ serviceCode: "IRL", articleCategory: "Printed Papers Text Books", weightGrams: 100 });
      assert.equal(gap.postageAmount, null);
      assert.ok(gap.errors.some((entry) => entry.includes("not exceeding 250g")));
    },
  },
  {
    name: "UMS Local and City-to-City base rates remain correct",
    run() {
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 250, senderCity: "Lahore", receiverCity: "Lahore" }).postageAmount, 90);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 500, senderCity: "Lahore", receiverCity: "Lahore" }).postageAmount, 110);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 501, senderCity: "Lahore", receiverCity: "Lahore" }).postageAmount, 155);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 250, senderCity: "Lahore", receiverCity: "Karachi" }).postageAmount, 150);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 500, senderCity: "Lahore", receiverCity: "Karachi" }).postageAmount, 230);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 501, senderCity: "Lahore", receiverCity: "Karachi" }).postageAmount, 305);
    },
  },
  {
    name: "COD emits final-delivery warning",
    run() {
      const cod = calculatePostage({ serviceCode: "COD", weightGrams: 100, senderCity: "Lahore", receiverCity: "Karachi" });
      assert.ok(cod.warnings.some((entry) => entry.includes("final-delivery")));
      assert.equal(cod.postageAmount, 150);
    },
  },
  {
    name: "Missing and invalid weights remain errors",
    run() {
      const missing = calculatePostage({ serviceCode: "RGL", weightGrams: null });
      const invalid = calculatePostage({ serviceCode: "RGL", weightGrams: -1 });
      assert.ok(missing.errors.includes("Missing weight"));
      assert.ok(invalid.errors.includes("Negative weight"));
    },
  },
  {
    name: "Summary aggregation returns postage totals and diagnostics",
    run() {
      const summary = buildBookingQuoteSummary([
        { serviceCode: "RGL", weightGrams: 20, senderCity: "Lahore", receiverCity: "Lahore" },
        { serviceCode: "PAR", weightGrams: 1000, senderCity: "Lahore", receiverCity: "Lahore" },
        { serviceCode: "VPL", weightGrams: 20, senderCity: "Lahore", receiverCity: "Lahore" },
      ]);

      assert.equal(summary.totalPostageAmount, 210);
      assert.equal(summary.totalBasePostage, 210);
      assert.equal(summary.totalValuePayableFee, 0);
      assert.equal(summary.totalInsuranceFee, 0);
      assert.equal(summary.totalOfficialPostalCharge, 210);
      assert.equal(summary.warningRows.length > 0, true);
      assert.equal(summary.errorRows.length, 0);
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
  console.log(`postageRates.test: ${passed}/${tests.length} passed`);
}

runAll();
