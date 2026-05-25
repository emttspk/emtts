import assert from "node:assert/strict";
import { canonicalShipmentStatus, isComplaintEnabled } from "./trackingStatus.js";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: "normalizes delivered variants to DELIVERED",
    run() {
      assert.equal(canonicalShipmentStatus("DELIVERED"), "DELIVERED");
      assert.equal(canonicalShipmentStatus("DELIVERED WITH PAYMENT"), "DELIVERED");
      assert.equal(canonicalShipmentStatus("delivered to addressee"), "DELIVERED");
    },
  },
  {
    name: "normalizes pending and transit variants to PENDING",
    run() {
      assert.equal(canonicalShipmentStatus("PENDING"), "PENDING");
      assert.equal(canonicalShipmentStatus("OUT_FOR_DELIVERY"), "PENDING");
      assert.equal(canonicalShipmentStatus("IN_TRANSIT"), "PENDING");
      assert.equal(canonicalShipmentStatus("PENDING (PAYMENT IN PROCESS)"), "PENDING");
    },
  },
  {
    name: "normalizes returned and undelivered variants to RETURN",
    run() {
      assert.equal(canonicalShipmentStatus("RETURNED"), "RETURN");
      assert.equal(canonicalShipmentStatus("RETURN_IN_PROCESS"), "PENDING");
      assert.equal(canonicalShipmentStatus("FAILED_DELIVERY"), "RETURN");
      assert.equal(canonicalShipmentStatus("RTO"), "RETURN");
    },
  },
  {
    name: "enables complaints only for pending articles inactive for at least seven days",
    run() {
      assert.equal(isComplaintEnabled(3, "PENDING", 7 * 24 - 1), false);
      assert.equal(isComplaintEnabled(3, "PENDING", 7 * 24), true);
      assert.equal(isComplaintEnabled(7, "PENDING", null), true);
      assert.equal(isComplaintEnabled(7, "DELIVERED", 9 * 24), false);
      assert.equal(isComplaintEnabled(null, "PENDING", null), false);
    },
  },
  {
    name: "falls back unknown and raw statuses to PENDING",
    run() {
      assert.equal(canonicalShipmentStatus("mystery status"), "PENDING");
      assert.equal(canonicalShipmentStatus(undefined), "PENDING");
      assert.equal(canonicalShipmentStatus("-"), "PENDING");
    },
  },
];

let failed = false;

for (const test of tests) {
  try {
    test.run();
    console.log(`PASS tracking status: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL tracking status: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`tracking status tests passed: ${tests.length}`);
}