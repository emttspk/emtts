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
  {
    name: "keeps booking-to-delivery pipeline states pending without downgrading",
    run() {
      const scenarios = [
        {
          trackingNumber: "UMS26051001",
          detail: "Booked at booking office Lahore GPO",
        },
        {
          trackingNumber: "UMS26051002",
          detail: "Received at DMO Lahore",
        },
        {
          trackingNumber: "UMS26051003",
          detail: "Dispatch from DMO Lahore to DMO Karachi",
        },
        {
          trackingNumber: "UMS26051004",
          detail: "Dispatch to delivery office Karachi GPO",
        },
        {
          trackingNumber: "UMS26051005",
          detail: "Sent out for delivery Karachi Delivery Office",
        },
      ];

      for (const scenario of scenarios) {
        const result = processTracking(
          {
            tracking: {
              history: [["2026-05-10", "09:00", scenario.detail, "-"]],
            },
          },
          { trackingNumber: scenario.trackingNumber },
        );
        assert.equal(result.status, "PENDING");
        assert.equal(canonicalShipmentStatus(result.systemStatus), "PENDING");
      }
    },
  },
  {
    name: "marks delivered and undelivered lifecycle outcomes safely",
    run() {
      const delivered = processTracking(
        {
          tracking: {
            history: [
              ["2026-05-01", "10:00", "Delivered to addressee", "Karachi Delivery Office"],
              ["2026-05-02", "11:00", "MOS delivered to addressee", "Lahore Booking Office"],
            ],
          },
        },
        { trackingNumber: "VPL26051006" },
      );
      assert.equal(delivered.status, "DELIVERED");
      assert.equal(canonicalShipmentStatus(delivered.systemStatus), "DELIVERED");

      const undelivered = processTracking(
        {
          tracking: {
            history: [
              ["2026-05-01", "09:00", "Sent out for delivery", "Karachi Delivery Office"],
              ["2026-05-02", "14:00", "Undelivered - addressee not available", "Karachi Delivery Office"],
            ],
          },
        },
        { trackingNumber: "UMS26051007" },
      );
      assert.equal(undelivered.status, "PENDING");
      assert.match(undelivered.systemStatus, /RETURN/i);
      assert.equal(canonicalShipmentStatus(undelivered.systemStatus), "PENDING");
    },
  },
  {
    name: "marks pending shipments complaint-eligible after inactivity threshold",
    run() {
      const result = processTracking(
        {
          first_date: "2026-05-01",
          tracking: {
            history: [["2026-05-01", "09:00", "Dispatch from DMO Lahore to DMO Karachi", "-"]],
          },
        },
        { trackingNumber: "UMS26051008" },
      );

      assert.equal(result.status, "PENDING");
      assert.equal(result.complaintEligible, true);
    },
  },
  {
    name: "keeps MOS and UMO recognition from breaking shipment status",
    run() {
      const mosArticle = processTracking(
        {
          tracking: {
            history: [["2026-05-01", "09:00", "Received at DMO Lahore", "Lahore DMO"]],
          },
        },
        { trackingNumber: "MOS26051009" },
      );
      const mosCanonical = canonicalShipmentStatus(mosArticle.systemStatus);
      assert.ok(["PENDING", "DELIVERED"].includes(mosCanonical));
      assert.notEqual(mosCanonical, "RETURN");

      const umoArticle = processTracking(
        {
          tracking: {
            history: [["2026-05-01", "11:00", "Delivered to addressee", "Karachi Delivery Office"]],
          },
        },
        { trackingNumber: "UMO26051010" },
      );
      const umoCanonical = canonicalShipmentStatus(umoArticle.systemStatus);
      assert.ok(["PENDING", "DELIVERED"].includes(umoCanonical));
      assert.notEqual(umoCanonical, "RETURN");
    },
  },
  {
    name: "handles multi-word cities without false return downgrade",
    run() {
      const result = processTracking(
        {
          tracking: {
            booking_office: "Rawalpindi Saddar Booking Office",
            delivery_office: "Karachi South Delivery Office",
            history: [
              ["2026-05-01", "09:00", "Dispatch from DMO Rawalpindi Saddar to DMO Karachi South", "-"],
              ["2026-05-02", "12:00", "Dispatch to delivery office Karachi South", "-"],
              ["2026-05-03", "15:00", "Delivered at delivery office Karachi South", "-"],
            ],
          },
        },
        { trackingNumber: "UMS26051011" },
      );

      assert.equal(result.status, "PENDING");
      assert.equal(canonicalShipmentStatus(result.systemStatus), "PENDING");
      assert.notEqual(canonicalShipmentStatus(result.systemStatus), "RETURN");
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