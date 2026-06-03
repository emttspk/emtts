import assert from "node:assert/strict";
import { resolveComplaintCardState } from "./complaintCardState";

type LifecycleLike = {
  exists: boolean;
  active: boolean;
  complaintId: string;
  dueDateText: string;
  dueDateTs: number | null;
  state: string;
  stateLabel: string;
  message: string;
  complaintCount: number;
  latestAttempt: number;
  previousComplaintReference: string;
};

type QueueLike = {
  id: string;
  trackingId: string;
  complaintStatus: string;
  complaintId: string | null;
  dueDate: string | null;
  nextRetryAt: string | null;
  retryCount: number;
  updatedAt: string;
};

const baseLifecycle: LifecycleLike = {
  exists: true,
  active: true,
  complaintId: "",
  dueDateText: "",
  dueDateTs: null,
  state: "ACTIVE",
  stateLabel: "ACTIVE",
  message: "",
  complaintCount: 1,
  latestAttempt: 1,
  previousComplaintReference: "",
};

const tests: Array<{ name: string; run: () => void }> = [
  {
    name: "complaint ID and due date force ACTIVE while queue says processing",
    run() {
      const lifecycle = {
        ...baseLifecycle,
        complaintId: "CMP-2001",
        dueDateText: "30-06-2026",
        dueDateTs: new Date("2026-06-30T00:00:00.000Z").getTime(),
      };
      const queue: QueueLike = {
        id: "q-1",
        trackingId: "VPL26050001",
        complaintStatus: "processing",
        complaintId: "CMP-2001",
        dueDate: "2026-06-30T00:00:00.000Z",
        nextRetryAt: null,
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      };
      const state = resolveComplaintCardState(lifecycle as any, "PENDING", queue as any);
      assert.equal(state, "ACTIVE");
    },
  },
  {
    name: "submitted queue status resolves to ACTIVE",
    run() {
      const lifecycle = { ...baseLifecycle, complaintId: "CMP-3001", dueDateTs: null, dueDateText: "" };
      const queue: QueueLike = {
        id: "q-2",
        trackingId: "VPL26050002",
        complaintStatus: "submitted",
        complaintId: "CMP-3001",
        dueDate: null,
        nextRetryAt: null,
        retryCount: 0,
        updatedAt: new Date().toISOString(),
      };
      const state = resolveComplaintCardState(lifecycle as any, "PENDING", queue as any);
      assert.equal(state, "ACTIVE");
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS bulk tracking complaint state: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL bulk tracking complaint state: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`bulk tracking complaint state tests passed: ${tests.length}`);
}
