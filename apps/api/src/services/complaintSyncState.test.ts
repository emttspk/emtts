import assert from "node:assert/strict";
import { deriveComplaintState } from "./complaint-sync.service.js";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: "delivered tracking resolves complaint even when shipment status is stale PENDING",
    run() {
      const decision = deriveComplaintState({
        priorState: "ACTIVE",
        trackingState: "DELIVERED",
        trackingAvailable: true,
        shipmentStatus: "PENDING",
        manualPendingOverride: false,
        dueDateTs: null,
        now: Date.now(),
      });
      assert.equal(decision.state, "RESOLVED");
      assert.equal(decision.reason, "verified_tracking_delivered");
      assert.equal(decision.trackingStateAtSync, "DELIVERED");
    },
  },
  {
    name: "manual pending override does not resolve complaint",
    run() {
      const decision = deriveComplaintState({
        priorState: "RESOLVED",
        trackingState: "DELIVERED",
        trackingAvailable: true,
        shipmentStatus: "DELIVERED",
        manualPendingOverride: true,
        dueDateTs: null,
        now: Date.now(),
      });
      assert.ok(["ACTIVE", "PROCESSING"].includes(decision.state));
      assert.notEqual(decision.state, "RESOLVED");
      assert.notEqual(decision.state, "CLOSED");
      assert.equal(decision.reason, "shipment_pending_manual_override");
      assert.equal(decision.trackingStateAtSync, "DELIVERED");
    },
  },
  {
    name: "verified delivered tracking resolves active complaint",
    run() {
      const decision = deriveComplaintState({
        priorState: "ACTIVE",
        trackingState: "DELIVERED",
        trackingAvailable: true,
        shipmentStatus: "DELIVERED",
        manualPendingOverride: false,
        dueDateTs: null,
        now: Date.now(),
      });
      assert.equal(decision.state, "RESOLVED");
      assert.equal(decision.reason, "verified_tracking_delivered");
      assert.equal(decision.trackingStateAtSync, "DELIVERED");
    },
  },
  {
    name: "verified returned tracking resolves active complaint",
    run() {
      const decision = deriveComplaintState({
        priorState: "ACTIVE",
        trackingState: "RETURNED",
        trackingAvailable: true,
        shipmentStatus: "RETURNED",
        manualPendingOverride: false,
        dueDateTs: null,
        now: Date.now(),
      });
      assert.equal(decision.state, "RESOLVED");
      assert.equal(decision.reason, "verified_tracking_returned");
      assert.equal(decision.trackingStateAtSync, "RETURNED");
    },
  },
  {
    name: "unavailable tracking keeps complaint active or processing",
    run() {
      const decision = deriveComplaintState({
        priorState: "ACTIVE",
        trackingState: "",
        trackingAvailable: false,
        shipmentStatus: "UNKNOWN",
        manualPendingOverride: false,
        dueDateTs: null,
        now: Date.now(),
      });
      assert.ok(["ACTIVE", "PROCESSING"].includes(decision.state));
      assert.notEqual(decision.state, "RESOLVED");
      assert.notEqual(decision.state, "CLOSED");
      assert.equal(decision.reason, "tracking_unavailable_or_uncertain");
      assert.equal(decision.trackingStateAtSync, "UNAVAILABLE");
    },
  },
  {
    name: "pending tracking with due passed returns OVERDUE and PENDING tracking state",
    run() {
      const decision = deriveComplaintState({
        priorState: "ACTIVE",
        trackingState: "PENDING",
        trackingAvailable: true,
        shipmentStatus: "PENDING",
        manualPendingOverride: false,
        dueDateTs: 0,
        now: Date.now(),
      });
      assert.equal(decision.state, "OVERDUE");
      assert.equal(decision.reason, "shipment_pending_system");
      assert.equal(decision.trackingStateAtSync, "PENDING");
    },
  },
  {
    name: "normalized delivered with payment tracking state returns DELIVERED",
    run() {
      const decision = deriveComplaintState({
        priorState: "ACTIVE",
        trackingState: "DELIVERED WITH PAYMENT",
        trackingAvailable: true,
        shipmentStatus: "DELIVERED",
        manualPendingOverride: false,
        dueDateTs: null,
        now: Date.now(),
      });
      assert.equal(decision.trackingStateAtSync, "DELIVERED");
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS complaint sync state: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL complaint sync state: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`complaint sync state tests passed: ${tests.length}`);
}
