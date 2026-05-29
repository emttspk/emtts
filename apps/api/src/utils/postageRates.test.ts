import assert from "node:assert/strict";
import { calculatePostage } from "./postageRates.js";

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
    name: "PRINTED_PAPER slab boundaries",
    run() {
      assert.equal(calculatePostage({ serviceCode: "IRL", articleCategory: "PRINTED_PAPER", weightGrams: 50 }).postageAmount, 20);
      assert.equal(calculatePostage({ serviceCode: "IRL", articleCategory: "PRINTED_PAPER", weightGrams: 51 }).postageAmount, 40);
      assert.equal(calculatePostage({ serviceCode: "IRL", articleCategory: "PRINTED_PAPER", weightGrams: 250 }).postageAmount, 40);
      assert.equal(calculatePostage({ serviceCode: "IRL", articleCategory: "PRINTED_PAPER", weightGrams: 251 }).postageAmount, 60);
      assert.equal(calculatePostage({ serviceCode: "IRL", articleCategory: "PRINTED_PAPER", weightGrams: 2000 }).postageAmount, 100);
    },
  },
  {
    name: "TEXT_BOOK supports slabs and keeps 50g-250g gap unsupported",
    run() {
      assert.equal(calculatePostage({ serviceCode: "IRL", articleCategory: "TEXT_BOOK", weightGrams: 50 }).postageAmount, 40);
      assert.equal(calculatePostage({ serviceCode: "IRL", articleCategory: "TEXT_BOOK", weightGrams: 251 }).postageAmount, 80);
      const gap = calculatePostage({ serviceCode: "IRL", articleCategory: "TEXT_BOOK", weightGrams: 100 });
      assert.equal(gap.postageAmount, null);
      assert.ok(gap.errors.some((entry) => entry.includes("50g and 250g")));
    },
  },
  {
    name: "PARCEL slab boundaries",
    run() {
      assert.equal(calculatePostage({ serviceCode: "PAR", weightGrams: 1000 }).postageAmount, 150);
      assert.equal(calculatePostage({ serviceCode: "PAR", weightGrams: 1001 }).postageAmount, 270);
      assert.equal(calculatePostage({ serviceCode: "PAR", weightGrams: 30000 }).postageAmount, 1320);
      const unsupported = calculatePostage({ serviceCode: "PAR", weightGrams: 30001 });
      assert.equal(unsupported.postageAmount, null);
      assert.ok(unsupported.errors.some((entry) => entry.includes("Unsupported slab for PARCEL")));
    },
  },
  {
    name: "UMS Local 250g, 500g, 501g, 1000g",
    run() {
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 250, senderCity: "Lahore", receiverCity: "Lahore" }).postageAmount, 90);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 500, senderCity: "Lahore", receiverCity: "Lahore" }).postageAmount, 110);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 501, senderCity: "Lahore", receiverCity: "Lahore" }).postageAmount, 155);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 1000, senderCity: "Lahore", receiverCity: "Lahore" }).postageAmount, 155);
    },
  },
  {
    name: "UMS City to City 250g, 500g, 501g, 1000g",
    run() {
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 250, senderCity: "Lahore", receiverCity: "Karachi" }).postageAmount, 150);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 500, senderCity: "Lahore", receiverCity: "Karachi" }).postageAmount, 230);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 501, senderCity: "Lahore", receiverCity: "Karachi" }).postageAmount, 305);
      assert.equal(calculatePostage({ serviceCode: "UMS", weightGrams: 1000, senderCity: "Lahore", receiverCity: "Karachi" }).postageAmount, 305);
    },
  },
  {
    name: "Missing weight returns error",
    run() {
      const result = calculatePostage({ serviceCode: "RGL", weightGrams: null });
      assert.ok(result.errors.includes("Missing weight"));
      assert.equal(result.postageAmount, null);
    },
  },
  {
    name: "Invalid negative weight returns error",
    run() {
      const result = calculatePostage({ serviceCode: "RGL", weightGrams: -1 });
      assert.ok(result.errors.includes("Invalid weight"));
      assert.equal(result.postageAmount, null);
    },
  },
  {
    name: "Unsupported service code returns error",
    run() {
      const result = calculatePostage({ serviceCode: "XYZ", weightGrams: 100 });
      assert.ok(result.errors.some((entry) => entry.includes("Unsupported service code")));
      assert.equal(result.postageAmount, null);
    },
  },
  {
    name: "Value payable mapping keeps VPL/VPP as Pakistan Post families",
    run() {
      const vpl = calculatePostage({ serviceCode: "VPL", weightGrams: 100 });
      const vpp = calculatePostage({ serviceCode: "VPP", weightGrams: 1000 });
      const cod = calculatePostage({ serviceCode: "COD", weightGrams: 100, senderCity: "Lahore", receiverCity: "Lahore" });
      assert.equal(vpl.articleCategory, "LETTER");
      assert.equal(vpp.articleCategory, "PARCEL");
      assert.equal(cod.articleCategory, "UMS");
      assert.ok(cod.warnings.length > 0);
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
