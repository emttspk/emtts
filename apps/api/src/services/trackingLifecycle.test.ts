import assert from "node:assert/strict";
import { buildTrackingLifecycleResolution, extractTrackingEventsFromRaw, type TrackingLifecycleEvent } from "./trackingLifecycle.js";

type TestCase = {
  name: string;
  run: () => void;
};

function recentEvent(hoursAgo: number, description: string, location = "Lahore DMO"): TrackingLifecycleEvent {
  const dt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const date = dt.toISOString().slice(0, 10);
  const time = dt.toISOString().slice(11, 16);
  return { date, time, description, location };
}

const tests: TestCase[] = [
  {
    name: "resolves a full booking-to-delivery chain as DELIVERED",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050000",
        events: [
          recentEvent(12, "Booked at counter", "Lahore Booking Office"),
          recentEvent(10, "Dispatch from district mail office Lahore to district mail office Karachi", "Lahore DMO"),
          recentEvent(8, "Received at DMO", "Karachi DMO"),
          recentEvent(6, "Dispatch to delivery office Karachi Delivery Office", "Karachi DMO"),
          recentEvent(3, "Sent out for delivery", "Karachi Delivery Office"),
          recentEvent(1, "Delivered to addressee", "Karachi Delivery Office"),
        ],
      });

      assert.equal(resolution.normalized_status, "DELIVERED");
      assert.equal(resolution.current_stage, "Delivered");
      assert.equal(resolution.canonical_status, "DELIVERED");
    },
  },
  {
    name: "resolves booking-only sequences as BOOKED",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050001",
        events: [recentEvent(2, "Booked at counter", "Lahore Booking Office")],
      });

      assert.equal(resolution.normalized_status, "BOOKED");
      assert.equal(resolution.current_stage, "Booked");
      assert.equal(resolution.latest_event?.description, "Booked at counter");
    },
  },
  {
    name: "treats receipt at DMO as hub handling rather than delivery completion",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050002",
        events: [recentEvent(2, "Received at DMO", "Karachi DMO")],
      });

      assert.equal(resolution.normalized_status, "AT_HUB");
      assert.equal(resolution.canonical_status, "PENDING");
    },
  },
  {
    name: "keeps district-mail-office dispatches in IN_TRANSIT",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050003",
        events: [
          recentEvent(5, "Booked", "Lahore Booking Office"),
          recentEvent(2, "Dispatch from district mail office Lahore to district mail office Karachi", "Lahore DMO"),
        ],
      });

      assert.equal(resolution.normalized_status, "IN_TRANSIT");
      assert.equal(resolution.current_stage, "In Transit");
    },
  },
  {
    name: "distinguishes dispatches to delivery office as IN_TRANSIT_TO_DELIVERY_OFFICE",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050004",
        events: [
          recentEvent(5, "Booked", "Lahore Booking Office"),
          recentEvent(2, "Dispatch to delivery office Karachi Delivery Office", "Karachi DMO"),
        ],
      });

      assert.equal(resolution.normalized_status, "IN_TRANSIT_TO_DELIVERY_OFFICE");
      assert.equal(resolution.display_status, "In Transit to Delivery Office");
    },
  },
  {
    name: "recognizes out-for-delivery scans",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050005",
        events: [
          recentEvent(2, "Sent out for delivery", "Karachi Delivery Office"),
        ],
      });

      assert.equal(resolution.normalized_status, "OUT_FOR_DELIVERY");
      assert.equal(resolution.progress, 90);
    },
  },
  {
    name: "requires an explicit delivery event for DELIVERED",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050006",
        events: [
          recentEvent(4, "Sent out for delivery", "Karachi Delivery Office"),
          recentEvent(1, "Delivered to addressee", "Karachi Delivery Office"),
        ],
      });

      assert.equal(resolution.normalized_status, "DELIVERED");
      assert.equal(resolution.canonical_status, "DELIVERED");
      assert.equal(resolution.is_terminal, true);
    },
  },
  {
    name: "marks undelivered sequences followed by return completion as RETURNED",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050007",
        events: [
          recentEvent(6, "Sent out for delivery", "Karachi Delivery Office"),
          recentEvent(4, "Undelivered addressee not found", "Karachi Delivery Office"),
          recentEvent(1, "Delivered to sender", "Lahore Booking Office"),
        ],
      });

      assert.equal(resolution.normalized_status, "RETURNED");
      assert.equal(resolution.canonical_status, "RETURNED");
    },
  },
  {
    name: "keeps refused/address-issue outcomes as failed-delivery pending without completion",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050009",
        events: [
          recentEvent(9, "Booked", "Lahore Booking Office"),
          recentEvent(6, "Dispatch to delivery office Karachi Delivery Office", "Karachi DMO"),
          recentEvent(4, "Sent out for delivery", "Karachi Delivery Office"),
          recentEvent(1, "Undelivered - address insufficient / refused by addressee", "Karachi Delivery Office"),
        ],
      });

      assert.equal(resolution.normalized_status, "FAILED_DELIVERY_PENDING");
      assert.equal(resolution.canonical_status, "PENDING");
      assert.equal(resolution.display_status, "Failed Delivery Pending");
    },
  },
  {
    name: "marks reverse movement after failed delivery as RETURN_IN_TRANSIT",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050010",
        events: [
          recentEvent(10, "Booked", "Lahore Booking Office"),
          recentEvent(8, "Dispatch to delivery office Karachi Delivery Office", "Karachi DMO"),
          recentEvent(5, "Undelivered addressee not found", "Karachi Delivery Office"),
          recentEvent(3, "Dispatch from district mail office Karachi to district mail office Lahore", "Karachi DMO"),
        ],
      });

      assert.equal(resolution.normalized_status, "RETURN_IN_TRANSIT");
      assert.equal(resolution.canonical_status, "RETURNED");
      assert.equal(resolution.current_stage, "Return in Transit");
    },
  },
  {
    name: "flags stale non-terminal sequences as STUCK with bucket",
    run() {
      const dt = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000);
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050011",
        events: [
          {
            date: dt.toISOString().slice(0, 10),
            time: "09:00",
            description: "Booked at counter",
            location: "Lahore Booking Office",
          },
        ],
      });

      assert.equal(resolution.normalized_status, "STUCK");
      assert.equal(resolution.underlying_status, "BOOKED");
      assert.equal(resolution.stuck_bucket, "15_DAYS");
      assert.equal(resolution.canonical_status, "PENDING");
    },
  },
  {
    name: "requires payment completion to keep value-payable delivery terminal",
    run() {
      const baseEvents = [
        recentEvent(4, "Sent out for delivery", "Karachi Delivery Office"),
        recentEvent(2, "Delivered to addressee", "Karachi Delivery Office"),
      ];

      const withoutPayment = buildTrackingLifecycleResolution({
        trackingNumber: "VPL26050012",
        events: baseEvents,
      });
      const withPayment = buildTrackingLifecycleResolution({
        trackingNumber: "VPL26050012",
        events: baseEvents,
        cycleInterpretation: {
          tracking_number: "VPL26050012",
          final_status: "DELIVERED WITH PAYMENT",
          cycle_detected: "Cycle 3",
          current_stage: "MOS Delivered",
          cycle_type: "MONEY_ORDER",
          cycle_status: "COMPLETED",
          mos_status: "COMPLETED",
          flags: ["PAYMENT_SETTLED"],
        },
      });

      assert.notEqual(withoutPayment.normalized_status, "DELIVERED");
      assert.equal(withPayment.normalized_status, "DELIVERED");
      assert.equal(withPayment.money_order_status, "COMPLETED");
    },
  },
  {
    name: "marks MOS/UMO mention as money-order in progress when not completed",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "COD26050013",
        events: [
          recentEvent(6, "Delivered to addressee", "Karachi Delivery Office"),
          recentEvent(2, "UMO issued for COD remittance", "Karachi DMO"),
        ],
      });

      assert.equal(resolution.money_order_status, "IN_PROGRESS");
      assert.equal(resolution.canonical_status, "PENDING");
    },
  },
  {
    name: "selects the latest event after sorting unsorted input chronologically",
    run() {
      const resolution = buildTrackingLifecycleResolution({
        trackingNumber: "LET26050008",
        events: [
          recentEvent(1, "Delivered to addressee", "Karachi Delivery Office"),
          recentEvent(5, "Booked", "Lahore Booking Office"),
          recentEvent(3, "Dispatch from district mail office Lahore to district mail office Karachi", "Lahore DMO"),
        ],
      });

      assert.equal(resolution.latest_event?.description, "Delivered to addressee");
      assert.equal(resolution.normalized_status, "DELIVERED");
    },
  },
  {
    name: "handles missing and malformed raw event data defensively",
    run() {
      assert.deepEqual(extractTrackingEventsFromRaw(null), []);
      assert.deepEqual(extractTrackingEventsFromRaw({ tracking: { history: null } }), []);

      const extracted = extractTrackingEventsFromRaw({
        tracking: {
          history: [
            ["2026-05-01", "09:00", "Received at DMO", "Karachi DMO"],
            { latest_date: "2026-05-02", status: "Sent out for delivery", city: "Karachi Delivery Office" },
            "Delivered to addressee",
          ],
        },
      });

      assert.equal(extracted.length, 3);
      assert.equal(extracted[1]?.time, "00:00");
      assert.equal(extracted[2]?.description, "Delivered to addressee");
    },
  },
];

let failed = false;

for (const test of tests) {
  try {
    test.run();
    console.log(`PASS tracking lifecycle: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL tracking lifecycle: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`tracking lifecycle tests passed: ${tests.length}`);
}