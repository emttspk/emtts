import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { prisma } from "../lib/prisma.js";
import { processComplaintQueueById } from "./complaint.processor.js";

type QueueRow = {
  id: string;
  userId: string;
  trackingId: string;
  payloadJson: Record<string, unknown>;
  complaintStatus: string;
  complaintId: string | null;
  dueDate: Date | null;
  retryCount: number;
  nextRetryAt: Date | null;
  lastError: string | null;
};

type ShipmentRow = {
  userId: string;
  trackingNumber: string;
  complaintStatus: string | null;
  complaintText: string | null;
};

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

async function withComplaintApiResponse(body: Record<string, unknown>, run: () => Promise<void>) {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/submit-complaint") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not-found" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const previous = process.env.PYTHON_SERVICE_URL;
  process.env.PYTHON_SERVICE_URL = `http://127.0.0.1:${port}`;

  try {
    await run();
  } finally {
    process.env.PYTHON_SERVICE_URL = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function withProcessorPrismaMock(input: {
  queueRow: QueueRow | null;
  shipment?: ShipmentRow | null;
  circuitState?: "closed" | "open" | "half_open";
}, run: (ctx: {
  getQueueRow: () => QueueRow | null;
  getShipment: () => ShipmentRow | null;
  getAuditWrites: () => number;
}) => Promise<void>) {
  const p = prisma as any;
  const original = {
    complaintQueue: p.complaintQueue,
    shipment: p.shipment,
    $executeRawUnsafe: p.$executeRawUnsafe,
    $queryRawUnsafe: p.$queryRawUnsafe,
  };

  let queueRow = input.queueRow ? { ...input.queueRow } : null;
  let shipment = input.shipment ? { ...input.shipment } : null;
  let circuitState = input.circuitState ?? "closed";
  const circuitFailures: Array<{ reason: string | null }> = [];
  let auditWrites = 0;

  p.complaintQueue = {
    findUnique: async ({ where }: any) => (queueRow && queueRow.id === where.id ? queueRow : null),
    update: async ({ where, data }: any) => {
      if (!queueRow || queueRow.id !== where.id) throw new Error("queue row missing");
      queueRow = { ...queueRow, ...data };
      return queueRow;
    },
  };

  p.shipment = {
    findUnique: async ({ where }: any) => {
      if (!shipment) return null;
      if (shipment.userId === where.userId_trackingNumber.userId && shipment.trackingNumber === where.userId_trackingNumber.trackingNumber) {
        return shipment;
      }
      return null;
    },
    upsert: async ({ create, update }: any) => {
      shipment = {
        userId: create.userId,
        trackingNumber: create.trackingNumber,
        complaintStatus: String(update.complaintStatus ?? create.complaintStatus ?? ""),
        complaintText: String(update.complaintText ?? create.complaintText ?? ""),
      };
      return shipment;
    },
  };

  p.$executeRawUnsafe = async (sql: string, ...values: unknown[]) => {
    if (sql.includes("INSERT INTO complaint_audit_logs")) {
      auditWrites += 1;
      return 1;
    }
    if (sql.includes("UPDATE complaint_circuit_state")) {
      const next = String(values[0] ?? "closed").toLowerCase();
      if (next === "open" || next === "half_open" || next === "closed") {
        circuitState = next;
      }
      return 1;
    }
    if (sql.includes("INSERT INTO complaint_circuit_events")) {
      if (sql.includes("'failure'")) {
        circuitFailures.push({ reason: String(values[1] ?? "") || null });
      }
      if (sql.includes("'success'")) {
        circuitFailures.length = 0;
      }
      return 1;
    }
    return 1;
  };

  p.$queryRawUnsafe = async (sql: string) => {
    if (sql.includes("FROM complaint_circuit_state")) {
      return [{ state: circuitState, openedAt: null }];
    }
    if (sql.includes("FROM complaint_circuit_events") && sql.includes("outcome = 'failure'")) {
      return [{ count: circuitFailures.length }];
    }
    if (sql.includes("SELECT id, actor_email")) {
      return [];
    }
    return [];
  };

  try {
    await run({
      getQueueRow: () => queueRow,
      getShipment: () => shipment,
      getAuditWrites: () => auditWrites,
    });
  } finally {
    p.complaintQueue = original.complaintQueue;
    p.shipment = original.shipment;
    p.$executeRawUnsafe = original.$executeRawUnsafe;
    p.$queryRawUnsafe = original.$queryRawUnsafe;
  }
}

function makeQueueRow(overrides?: Partial<QueueRow>): QueueRow {
  return {
    id: "cq-1",
    userId: "user-1",
    trackingId: "VPL26050001",
    payloadJson: {
      tracking_number: "VPL26050001",
      phone: "03001234567",
      complaint_text: "Pending delivery",
      attempt_number: 1,
    },
    complaintStatus: "queued",
    complaintId: null,
    dueDate: null,
    retryCount: 0,
    nextRetryAt: new Date(),
    lastError: null,
    ...(overrides ?? {}),
  };
}

function readHistoryEntries(complaintText: string | null | undefined) {
  const text = String(complaintText ?? "");
  const marker = "COMPLAINT_HISTORY_JSON:";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex < 0) return [] as Array<Record<string, unknown>>;
  const raw = text.slice(markerIndex + marker.length).trim();
  if (!raw) return [] as Array<Record<string, unknown>>;
  const parsed = JSON.parse(raw) as { entries?: Array<Record<string, unknown>> };
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

const tests: TestCase[] = [
  {
    name: "processor success stores complaint id due date status and response text",
    async run() {
      await withComplaintApiResponse({
        success: true,
        response_text: "You complaint has been submitted successfully. Complaint No: 7788 Due Date on 26/05/2026",
        complaint_number: "7788",
        due_date: "26/05/2026",
      }, async () => {
        await withProcessorPrismaMock({
          queueRow: makeQueueRow(),
          shipment: null,
        }, async ({ getQueueRow, getShipment, getAuditWrites }) => {
          const result = await processComplaintQueueById("cq-1");
          assert.equal(result.success, true);
          assert.equal(result.status, "FILED");
          assert.equal(result.complaintId, "CMP-7788");
          assert.equal(result.dueDate, "26-05-2026");
          assert.equal(getQueueRow()?.complaintStatus, "submitted");
          assert.equal(getShipment()?.complaintStatus, "FILED");
          assert.ok(String(getShipment()?.complaintText ?? "").includes("COMPLAINT_ID: CMP-7788"));
          assert.ok(String(getShipment()?.complaintText ?? "").includes("COMPLAINT_STATE: ACTIVE"));
          assert.ok(String(getShipment()?.complaintText ?? "").includes("complaintStateReason: submitted_pending_sync"));
          const snapshotText = String(getShipment()?.complaintText ?? "");
          const marker = "COMPLAINT_HISTORY_JSON:";
          const markerIndex = snapshotText.lastIndexOf(marker);
          assert.ok(markerIndex > -1);
          const snapshotRaw = snapshotText.slice(markerIndex + marker.length).trim();
          const snapshotJson = JSON.parse(snapshotRaw) as { entries?: Array<Record<string, unknown>> };
          assert.ok(Array.isArray(snapshotJson.entries));
          assert.equal(snapshotJson.entries?.length, 1);
          assert.equal(String(snapshotJson.entries?.[0]?.complaintId ?? ""), "CMP-7788");
          assert.equal(String(snapshotJson.entries?.[0]?.trackingId ?? ""), "VPL26050001");
          assert.equal(Number(snapshotJson.entries?.[0]?.attemptNumber ?? 0), 1);
          assert.ok(getAuditWrites() >= 1);
        });
      });
    },
  },
  {
    name: "processor duplicate response path updates status safely",
    async run() {
      await withComplaintApiResponse({
        success: true,
        response_text: "Complaint already under process",
        already_exists: true,
      }, async () => {
        await withProcessorPrismaMock({
          queueRow: makeQueueRow({
            complaintId: "CMP-OLD",
            dueDate: new Date("2026-06-10T00:00:00.000Z"),
            payloadJson: {
              tracking_number: "VPL26050001",
              phone: "03001234567",
              complaint_text: "Pending delivery again",
              attempt_number: 2,
              previous_complaint_reference: "CMP-OLD",
              shipment_status_at_complaint_submit: "PENDING",
            },
          }),
          shipment: null,
        }, async ({ getQueueRow, getShipment }) => {
          const result = await processComplaintQueueById("cq-1");
          assert.equal(result.success, true);
          assert.equal(result.status, "FILED");
          assert.equal(getQueueRow()?.complaintStatus, "duplicate");
          assert.equal(result.complaintId, "CMP-OLD");
          assert.ok(String(getShipment()?.complaintText ?? "").includes("COMPLAINT_STATE: ACTIVE"));
          assert.ok(String(getShipment()?.complaintText ?? "").includes("complaintStateReason: submitted_pending_sync"));
        });
      });
    },
  },
  {
    name: "duplicate worker callback does not create second history entry",
    async run() {
      await withComplaintApiResponse({
        success: true,
        response_text: "You complaint has been submitted successfully. Complaint No: 7788 Due Date on 26/05/2026",
        complaint_number: "7788",
        due_date: "26/05/2026",
      }, async () => {
        await withProcessorPrismaMock({
          queueRow: makeQueueRow(),
          shipment: null,
        }, async ({ getShipment }) => {
          const first = await processComplaintQueueById("cq-1");
          assert.equal(first.success, true);
          assert.equal(readHistoryEntries(getShipment()?.complaintText).length, 1);

          const second = await processComplaintQueueById("cq-1");
          assert.equal(second.success, true);
          const entries = readHistoryEntries(getShipment()?.complaintText);
          assert.equal(entries.length, 1);
          assert.equal(String(entries[0]?.complaintId ?? ""), "CMP-7788");
          assert.equal(Number(entries[0]?.attemptNumber ?? 0), 1);
        });
      });
    },
  },
  {
    name: "reopen creates exactly one new attempt",
    async run() {
      const existingText = [
        "COMPLAINT_ID: CMP-100 | DUE_DATE: 20-05-2026 | COMPLAINT_STATE: RESOLVED",
        "User complaint:",
        "First complaint",
        "",
        "Response:",
        "Resolved",
        "",
        "COMPLAINT_HISTORY_JSON: {\"entries\":[{\"complaintId\":\"CMP-100\",\"trackingId\":\"VPL26050001\",\"createdAt\":\"2026-05-01T00:00:00.000Z\",\"dueDate\":\"20-05-2026\",\"status\":\"RESOLVED\",\"attemptNumber\":1,\"previousComplaintReference\":\"\"}]}"
      ].join("\n");

      await withComplaintApiResponse({
        success: true,
        response_text: "You complaint has been submitted successfully. Complaint No: 9900 Due Date on 30/06/2026",
        complaint_number: "9900",
        due_date: "30/06/2026",
      }, async () => {
        await withProcessorPrismaMock({
          queueRow: makeQueueRow({
            complaintId: "CMP-100",
            dueDate: new Date("2026-05-20T00:00:00.000Z"),
            payloadJson: {
              tracking_number: "VPL26050001",
              phone: "03001234567",
              complaint_text: "Reopen complaint",
              current_user_remarks: "Reopen complaint",
              attempt_number: 2,
              previous_complaint_reference: "CMP-100",
              shipment_status_at_complaint_submit: "PENDING",
            },
          }),
          shipment: {
            userId: "user-1",
            trackingNumber: "VPL26050001",
            complaintStatus: "FILED",
            complaintText: existingText,
          },
        }, async ({ getShipment }) => {
          const result = await processComplaintQueueById("cq-1");
          assert.equal(result.success, true);
          assert.equal(result.complaintId, "CMP-9900");

          const entries = readHistoryEntries(getShipment()?.complaintText);
          assert.equal(entries.length, 2);
          assert.equal(String(entries[0]?.complaintId ?? ""), "CMP-100");
          assert.equal(String(entries[1]?.complaintId ?? ""), "CMP-9900");
          assert.equal(Number(entries[0]?.attemptNumber ?? 0), 1);
          assert.equal(Number(entries[1]?.attemptNumber ?? 0), 2);
        });
      });
    },
  },
  {
    name: "processor failure records retry state and error",
    async run() {
      await withComplaintApiResponse({
        success: false,
        response_text: "Submission failed: remote timeout",
      }, async () => {
        await withProcessorPrismaMock({
          queueRow: makeQueueRow({ retryCount: 0 }),
          shipment: null,
        }, async ({ getQueueRow }) => {
          const result = await processComplaintQueueById("cq-1");
          assert.equal(result.success, false);
          assert.equal(result.status, "ERROR");
          assert.equal(getQueueRow()?.complaintStatus, "retry_pending");
          assert.ok(String(getQueueRow()?.lastError ?? "").length > 0);
        });
      });
    },
  },
  {
    name: "processor failure does not corrupt existing shipment complaint metadata",
    async run() {
      await withComplaintApiResponse({
        success: false,
        response_text: "Submission failed: remote timeout",
      }, async () => {
        await withProcessorPrismaMock({
          queueRow: makeQueueRow({ retryCount: 1 }),
          shipment: {
            userId: "user-1",
            trackingNumber: "VPL26050001",
            complaintStatus: "FILED",
            complaintText: "COMPLAINT_ID: CMP-777 | DUE_DATE: 26-05-2026 | COMPLAINT_STATE: ACTIVE",
          },
        }, async ({ getQueueRow, getShipment }) => {
          const result = await processComplaintQueueById("cq-1");
          assert.equal(result.success, false);
          assert.equal(result.status, "ERROR");
          assert.equal(getQueueRow()?.complaintStatus, "retry_pending");
          assert.equal(getShipment()?.trackingNumber, "VPL26050001");
          assert.equal(getShipment()?.complaintStatus, "ERROR");
          assert.match(String(getShipment()?.complaintText ?? ""), /COMPLAINT_ID:\s*CMP-777/i);
          assert.match(String(getShipment()?.complaintText ?? ""), /DUE_DATE:\s*26-05-2026/i);
        });
      });
    },
  },
  {
    name: "processor reports missing queue row safely",
    async run() {
      await withProcessorPrismaMock({
        queueRow: null,
      }, async () => {
        const result = await processComplaintQueueById("missing-id");
        assert.equal(result.success, false);
        assert.equal(result.status, "MISSING");
      });
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS complaint processor: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL complaint processor: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`complaint processor tests passed: ${tests.length}`);
}
