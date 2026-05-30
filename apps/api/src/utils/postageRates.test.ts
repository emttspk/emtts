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
      assert.equal(calculatePostage({ serviceCode: "ORDINARY", weightGrams: 20 }).basePostageAmount, 30);
      assert.equal(calculatePostage({ serviceCode: "ORDINARY", weightGrams: 21 }).basePostageAmount, 60);
      assert.equal(calculatePostage({ serviceCode: "ORDINARY", weightGrams: 50 }).basePostageAmount, 60);
      assert.equal(calculatePostage({ serviceCode: "ORDINARY", weightGrams: 51 }).basePostageAmount, 75);
      assert.equal(calculatePostage({ serviceCode: "ORDINARY", weightGrams: 2000 }).basePostageAmount, 380);
    },
  },
  {
    name: "RGL includes letter registration fee",
    run() {
      const rgl = calculatePostage({ serviceCode: "RGL", weightGrams: 20 });
      assert.equal(rgl.basePostageAmount, 30);
      assert.equal(rgl.registrationFeeAmount, 30);
      assert.equal(rgl.totalOfficialPostalCharge, 60);
    },
  },
  {
    name: "Registered parcel adds parcel registration fee",
    run() {
      const parcel = calculatePostage({ serviceCode: "PAR", weightGrams: 1000, isRegistered: true });
      assert.equal(parcel.basePostageAmount, 150);
      assert.equal(parcel.registrationFeeAmount, 75);
      assert.equal(parcel.totalOfficialPostalCharge, 225);
    },
  },
  {
    name: "VPL missing value payable fee schedule returns missing component",
    run() {
      const vpl = calculatePostage({ serviceCode: "VPL", weightGrams: 20 });
      assert.equal(vpl.basePostageAmount, 30);
      assert.equal(vpl.registrationFeeAmount, 30);
      assert.equal(vpl.valuePayableFeeAmount, null);
      assert.ok(vpl.missingComponents.includes("VALUE_PAYABLE_FEE"));
      assert.equal(vpl.totalOfficialPostalCharge, null);
    },
  },
  {
    name: "VPP missing value payable fee schedule returns missing component",
    run() {
      const vpp = calculatePostage({ serviceCode: "VPP", weightGrams: 1000 });
      assert.equal(vpp.basePostageAmount, 150);
      assert.equal(vpp.registrationFeeAmount, 75);
      assert.equal(vpp.valuePayableFeeAmount, null);
      assert.ok(vpp.missingComponents.includes("VALUE_PAYABLE_FEE"));
    },
  },
  {
    name: "IRL missing insurance schedule returns missing component",
    run() {
      const irl = calculatePostage({ serviceCode: "IRL", weightGrams: 20 });
      assert.equal(irl.basePostageAmount, 30);
      assert.equal(irl.registrationFeeAmount, 30);
      assert.equal(irl.insuranceFeeAmount, null);
      assert.ok(irl.missingComponents.includes("INSURANCE_FEE"));
      assert.equal(irl.totalOfficialPostalCharge, null);
    },
  },
  {
    name: "TEXT_BOOK keeps 50g-250g gap unsupported",
    run() {
      const gap = calculatePostage({ serviceCode: "IRL", articleCategory: "TEXT_BOOK", weightGrams: 100 });
      assert.equal(gap.basePostageAmount, null);
      assert.ok(gap.errors.some((entry) => entry.includes("50g and 250g")));
    },
  },
  {
    name: "UMS Local and City-to-City base rates remain correct",
    run() {
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 250, senderCity: "Lahore", receiverCity: "Lahore" }).basePostageAmount, 90);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 500, senderCity: "Lahore", receiverCity: "Lahore" }).basePostageAmount, 110);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 501, senderCity: "Lahore", receiverCity: "Lahore" }).basePostageAmount, 155);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 250, senderCity: "Lahore", receiverCity: "Karachi" }).basePostageAmount, 150);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 500, senderCity: "Lahore", receiverCity: "Karachi" }).basePostageAmount, 230);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 501, senderCity: "Lahore", receiverCity: "Karachi" }).basePostageAmount, 305);
    },
  },
  {
    name: "COD uncertain mapping produces warning without guessed fee",
    run() {
      const cod = calculatePostage({ serviceCode: "COD", weightGrams: 100, senderCity: "Lahore", receiverCity: "Karachi" });
      assert.ok(cod.warnings.some((entry) => entry.includes("COD")));
      assert.equal(cod.basePostageAmount, null);
      assert.ok(cod.missingComponents.includes("BASE_POSTAGE"));
    },
  },
  {
    name: "Missing and invalid weights remain errors",
    run() {
      const missing = calculatePostage({ serviceCode: "RGL", weightGrams: null });
      const invalid = calculatePostage({ serviceCode: "RGL", weightGrams: -1 });
      assert.ok(missing.errors.includes("Missing weight"));
      assert.ok(invalid.errors.includes("Invalid weight"));
    },
  },
  {
    name: "Summary aggregation totals include base/registration/value payable/insurance and official total",
    run() {
      const summary = buildBookingQuoteSummary([
        { shipmenttype: "RGL", Weight: "20", senderCity: "Lahore", receiverCity: "Lahore" },
        { shipmenttype: "PAR", Weight: "1000", senderCity: "Lahore", receiverCity: "Lahore", isRegistered: true },
        { shipmenttype: "VPL", Weight: "20", senderCity: "Lahore", receiverCity: "Lahore" },
      ]);

      assert.equal(summary.totalBasePostage, 210);
      assert.equal(summary.totalRegistrationFee, 135);
      assert.equal(summary.totalValuePayableFee, 0);
      assert.equal(summary.totalInsuranceFee, 0);
      assert.equal(summary.totalOfficialPostalCharge, 285);
      assert.equal(summary.warningRows.length > 0, true);
      assert.equal(summary.errorRows.length > 0, true);
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
