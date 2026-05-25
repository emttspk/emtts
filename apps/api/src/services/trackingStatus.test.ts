import assert from "node:assert/strict";
import { canonicalShipmentStatus, isComplaintEnabled, processTracking } from "./trackingStatus.js";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: "marks COD/MOS completion as DELIVERED WITH PAYMENT",
    run() {
      const result = processTracking(
        {
          tracking: {
            history: [
              ["2026-05-01", "09:00", "Delivered to addressee", "Karachi Delivery Office"],
              ["2026-05-02", "10:00", "MOS delivered to addressee", "Lahore Booking Office"],
            ],
          },
        },
        { trackingNumber: "COD26050100" },
      );

      assert.equal(result.systemStatus, "DELIVERED WITH PAYMENT");
      assert.equal(result.status, "DELIVERED");
      assert.equal(canonicalShipmentStatus(result.systemStatus), "DELIVERED");
    },
  },
  {
    name: "keeps undelivered/refused/address issue flows in pending return-in-progress state",
    run() {
      const result = processTracking(
        {
          tracking: {
            history: [
              ["2026-05-01", "09:00", "Sent out for delivery", "Karachi Delivery Office"],
              ["2026-05-02", "10:00", "Undelivered - address insufficient / refused", "Karachi Delivery Office"],
            ],
          },
        },
        { trackingNumber: "VPL26050101" },
      );

      assert.equal(result.status, "PENDING");
      assert.match(result.systemStatus, /RETURN IN PROGRESS/i);
      assert.equal(canonicalShipmentStatus(result.systemStatus), "PENDING");
    },
  },
  {
    name: "marks delivered-to-sender completion as RETURN canonical status",
    run() {
      const result = processTracking(
        {
          tracking: {
            history: [
              ["2026-05-01", "09:00", "Undelivered addressee not found", "Karachi Delivery Office"],
              ["2026-05-03", "11:30", "Delivered to sender", "Lahore Booking Office"],
            ],
          },
        },
        { trackingNumber: "VPP26050102" },
      );

      assert.equal(result.systemStatus, "RETURNED");
      assert.equal(result.status, "RETURN");
      assert.equal(canonicalShipmentStatus(result.systemStatus), "RETURN");
    },
  },
  {
    name: "keeps RLO hold scans pending while preserving HELD_AT_RLO system status",
    run() {
      const result = processTracking(
        {
          tracking: {
            history: [["2026-05-01", "09:00", "Article held at RLO for verification", "Lahore RLO"]],
          },
        },
        { trackingNumber: "RGL26050103" },
      );

      assert.equal(result.systemStatus, "HELD_AT_RLO");
      assert.equal(result.status, "PENDING");
      assert.equal(canonicalShipmentStatus(result.systemStatus), "PENDING");
    },
  },
  {
    name: "treats intimation/notice-awaiting-collection as non-terminal pending canonical state",
    run() {
      const result = processTracking(
        {
          tracking: {
            history: [["2026-05-01", "09:00", "Intimation served / notice issued awaiting collection", "Karachi Post Office"]],
          },
        },
        { trackingNumber: "UMS26050104" },
      );

      assert.equal(result.status, "PENDING");
      assert.equal(canonicalShipmentStatus(result.systemStatus), "PENDING");
    },
  },
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