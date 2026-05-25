import assert from "node:assert/strict";
import { composeComplaintText, extractComplaintHistory, parseComplaintRecord } from "./complaint.service.js";

type TestCase = {
  name: string;
  run: () => void;
};

const tests: TestCase[] = [
  {
    name: "parses complaint ID from COMPLAINT_ID metadata variant",
    run() {
      const parsed = parseComplaintRecord("COMPLAINT_ID: CMP-12345 | DUE_DATE: 26-05-2026 | COMPLAINT_STATE: ACTIVE", "FILED");
      assert.equal(parsed.complaintId, "CMP-12345");
    },
  },
  {
    name: "parses complaint ID from Complaint ID text variant",
    run() {
      const parsed = parseComplaintRecord("Complaint ID CMP-7788\nDue Date on 26/05/2026", "FILED");
      assert.equal(parsed.complaintId, "CMP-7788");
    },
  },
  {
    name: "parses due date variants slash dash and iso",
    run() {
      const slash = parseComplaintRecord("COMPLAINT_ID: CMP-1 | DUE_DATE: 26/05/2026", "FILED");
      const dash = parseComplaintRecord("COMPLAINT_ID: CMP-2 | DUE_DATE: 26-05-2026", "FILED");
      const iso = parseComplaintRecord("COMPLAINT_ID: CMP-3 | DUE_DATE: 2026-05-26", "FILED");
      assert.ok(slash.dueDateTs != null);
      assert.ok(dash.dueDateTs != null);
      assert.ok(iso.dueDateTs != null);
    },
  },
  {
    name: "handles missing complaint ID and due date safely",
    run() {
      const parsed = parseComplaintRecord("Response only without identifiers", "ERROR");
      assert.equal(parsed.complaintId, "");
      assert.equal(parsed.dueDate, "");
      assert.equal(parsed.dueDateTs, null);
      assert.equal(parsed.active, false);
    },
  },
  {
    name: "maps status text fallback from complaint status when metadata state is absent",
    run() {
      const filed = parseComplaintRecord("COMPLAINT_ID: CMP-44", "FILED");
      const resolved = parseComplaintRecord("COMPLAINT_ID: CMP-44", "RESOLVED");
      assert.equal(filed.state, "ACTIVE");
      assert.equal(resolved.state, "RESOLVED");
    },
  },
  {
    name: "extracts history from stored json marker and preserves attempt ordering",
    run() {
      const text = composeComplaintText({
        complaintId: "CMP-100",
        dueDate: "26-05-2026",
        state: "ACTIVE",
        userComplaint: "First",
        responseText: "Accepted",
        historyEntries: [
          {
            complaintId: "CMP-099",
            trackingId: "VPL1",
            createdAt: "2026-05-01T00:00:00.000Z",
            dueDate: "20-05-2026",
            status: "ACTIVE",
            attemptNumber: 1,
            previousComplaintReference: "",
            userComplaint: "old",
          },
          {
            complaintId: "CMP-100",
            trackingId: "VPL1",
            createdAt: "2026-05-10T00:00:00.000Z",
            dueDate: "26-05-2026",
            status: "ACTIVE",
            attemptNumber: 2,
            previousComplaintReference: "CMP-099",
            userComplaint: "new",
          },
        ],
      });

      const history = extractComplaintHistory(text, "FILED", "VPL1");
      assert.equal(history.length, 2);
      assert.equal(history[0]?.attemptNumber, 1);
      assert.equal(history[1]?.attemptNumber, 2);
    },
  },
  {
    name: "falls back to single inferred history entry when marker is missing",
    run() {
      const text = "COMPLAINT_ID: CMP-551 | DUE_DATE: 26-05-2026 | COMPLAINT_STATE: ACTIVE\nUser complaint:\nNeed help\n\nResponse:\nQueued";
      const history = extractComplaintHistory(text, "FILED", "VPL2");
      assert.equal(history.length, 1);
      assert.equal(history[0]?.complaintId, "CMP-551");
      assert.equal(history[0]?.trackingId, "VPL2");
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    test.run();
    console.log(`PASS complaint parser: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL complaint parser: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`complaint parser tests passed: ${tests.length}`);
}
