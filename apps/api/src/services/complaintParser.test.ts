import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeComplaintText, extractComplaintHistory, parseComplaintRecord, appendComplaintHistoryAttempt } from "./complaint.service.js";

type TestCase = {
  name: string;
  run: () => void;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    name: "DD-MM-YYYY is NOT interpreted as MM-DD-YYYY (08-06-2026 = June 8, not August 6)",
    run() {
      const parsed = parseComplaintRecord("COMPLAINT_ID: CMP-T1 | DUE_DATE: 08-06-2026", "FILED");
      assert.ok(parsed.dueDateTs != null);
      const expected = new Date(2026, 5, 8).getTime(); // June 8, 2026
      assert.equal(parsed.dueDateTs, expected, "08-06-2026 should be June 8, 2026, not August 6, 2026");
    },
  },
  {
    name: "DD-MM-YYYY with day <= 12 is not swapped (10-06-2026 = June 10, not October 6)",
    run() {
      const parsed = parseComplaintRecord("COMPLAINT_ID: CMP-T2 | DUE_DATE: 10-06-2026", "FILED");
      assert.ok(parsed.dueDateTs != null);
      const expected = new Date(2026, 5, 10).getTime(); // June 10, 2026
      assert.equal(parsed.dueDateTs, expected, "10-06-2026 should be June 10, 2026, not October 6, 2026");
    },
  },
  {
    name: "DD-MM-YYYY with valid month-day edge (11-06-2026 = November? No, June 11)",
    run() {
      const parsed = parseComplaintRecord("COMPLAINT_ID: CMP-T3 | DUE_DATE: 11-06-2026", "FILED");
      assert.ok(parsed.dueDateTs != null);
      const expected = new Date(2026, 5, 11).getTime(); // June 11, 2026
      assert.equal(parsed.dueDateTs, expected, "11-06-2026 should be June 11, 2026");
    },
  },
  {
    name: "empty due date string returns null",
    run() {
      const parsed = parseComplaintRecord("COMPLAINT_ID: CMP-T4 | DUE_DATE: ", "FILED");
      assert.equal(parsed.dueDateTs, null, "empty due date should return null");
    },
  },
  {
    name: "DD-MM-YYYY without leading zeros works correctly (8-6-2026 = June 8, 2026)",
    run() {
      const parsed = parseComplaintRecord("COMPLAINT_ID: CMP-T5 | DUE_DATE: 8-6-2026", "FILED");
      assert.ok(parsed.dueDateTs != null);
      const expected = new Date(2026, 5, 8).getTime(); // June 8, 2026
      assert.equal(parsed.dueDateTs, expected, "8-6-2026 should be June 8, 2026");
    },
  },
  {
    name: "preserves due date text while parsing complaint metadata",
    run() {
      const slash = parseComplaintRecord("COMPLAINT_ID: CMP-101 | DUE_DATE: 26/05/2026 | COMPLAINT_STATE: ACTIVE", "FILED");
      const dash = parseComplaintRecord("COMPLAINT_ID: CMP-102 | DUE_DATE: 26-05-2026 | COMPLAINT_STATE: ACTIVE", "FILED");
      assert.equal(slash.dueDate, "26/05/2026");
      assert.equal(dash.dueDate, "26-05-2026");
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
    name: "deduplicates repeated complaint IDs from stored history",
    run() {
      const text = composeComplaintText({
        complaintId: "CMP-100",
        dueDate: "26-05-2026",
        state: "ACTIVE",
        userComplaint: "First",
        responseText: "Accepted",
        historyEntries: [
          {
            complaintId: "CMP-100",
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
            createdAt: "2026-05-02T00:00:00.000Z",
            dueDate: "20-05-2026",
            status: "ACTIVE",
            attemptNumber: 1,
            previousComplaintReference: "",
            userComplaint: "old duplicate",
          },
        ],
      });

      const history = extractComplaintHistory(text, "FILED", "VPL1");
      assert.equal(history.length, 1);
      assert.equal(history[0]?.complaintId, "CMP-100");
      assert.equal(history[0]?.attemptNumber, 1);
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
  {
    name: "preserves canonical complaint status header format",
    run() {
      const text = composeComplaintText({
        complaintId: "CMP-7001",
        dueDate: "26-05-2026",
        state: "ACTIVE",
        userComplaint: "Pending too long",
        responseText: "Queued",
        historyEntries: [],
      });
      const firstLine = String(text.split(/\r?\n/)[0] ?? "").trim();
      assert.equal(firstLine, "COMPLAINT_ID: CMP-7001 | DUE_DATE: 26-05-2026 | COMPLAINT_STATE: ACTIVE");
    },
  },
  {
    name: "appendComplaintHistoryAttempt does NOT inherit previous attempt's due date when new entry has empty due date",
    run() {
      const existing = [
        {
          complaintId: "CMP-100",
          trackingId: "VPL1",
          createdAt: "2026-05-01T00:00:00.000Z",
          dueDate: "11-06-2026",
          status: "ACTIVE",
          attemptNumber: 1,
          previousComplaintReference: "",
          userComplaint: "first attempt",
        },
      ];
      const nextEntry = {
        complaintId: "CMP-200",
        trackingId: "VPL1",
        createdAt: "2026-06-10T00:00:00.000Z",
        dueDate: "",
        status: "ACTIVE",
        attemptNumber: 2,
        previousComplaintReference: "CMP-100",
        userComplaint: "second attempt with no due date from Python",
      };
      const merged = appendComplaintHistoryAttempt(existing, nextEntry);
      assert.equal(merged.length, 2);
      assert.equal(merged[0]?.dueDate, "11-06-2026");
      assert.equal(merged[1]?.dueDate, "", "attempt 2 must NOT inherit attempt 1's due date");
    },
  },
  {
    name: "appendComplaintHistoryAttempt preserves different due dates for each attempt",
    run() {
      const existing = [
        {
          complaintId: "CMP-100",
          trackingId: "VPL1",
          createdAt: "2026-05-01T00:00:00.000Z",
          dueDate: "11-06-2026",
          status: "ACTIVE",
          attemptNumber: 1,
          previousComplaintReference: "",
          userComplaint: "first attempt",
        },
      ];
      const nextEntry = {
        complaintId: "CMP-200",
        trackingId: "VPL1",
        createdAt: "2026-06-10T00:00:00.000Z",
        dueDate: "08-06-2026",
        status: "ACTIVE",
        attemptNumber: 2,
        previousComplaintReference: "CMP-100",
        userComplaint: "second attempt with valid due date",
      };
      const merged = appendComplaintHistoryAttempt(existing, nextEntry);
      assert.equal(merged.length, 2);
      assert.equal(merged[0]?.dueDate, "11-06-2026");
      assert.equal(merged[1]?.dueDate, "08-06-2026", "attempt 2 must keep its own due date");
    },
  },
  {
    name: "migration SQL exists for ComplaintNotification table",
    run() {
      const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");
      const entries = fs.readdirSync(migrationsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(migrationsDir, entry.name, "migration.sql"))
        .filter((migrationPath) => fs.existsSync(migrationPath));

      const hasComplaintNotificationMigration = entries.some((migrationPath) => {
        const sql = fs.readFileSync(migrationPath, "utf8");
        return /CREATE TABLE IF NOT EXISTS\s+"ComplaintNotification"/i.test(sql)
          || /CREATE TABLE\s+"ComplaintNotification"/i.test(sql);
      });

      assert.equal(hasComplaintNotificationMigration, true);
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
