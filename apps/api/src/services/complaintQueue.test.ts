import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import {
  COMPLAINT_MAX_RETRIES,
  COMPLAINT_PROCESSING_STALE_AFTER_MS,
  getComplaintNextRetryAt,
  enqueueComplaint,
  findActiveComplaintDuplicate,
  getQueuedComplaintsForRetry,
  markComplaintQueueFailure,
  markComplaintQueueProcessing,
  markComplaintQueueSuccess,
  normalizeComplaintQueueStatus,
  rescueStuckProcessingComplaints,
} from "./complaint-queue.service.js";

type QueueRow = {
  id: string;
  userId: string;
  trackingId: string;
  complaintStatus: string;
  complaintId: string | null;
  dueDate: Date | null;
  retryCount: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  payloadJson?: Record<string, unknown>;
  updatedAt: Date;
  createdAt: Date;
};

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

const seedNow = new Date("2026-05-26T00:00:00.000Z");

function makeQueueRow(partial?: Partial<QueueRow>): QueueRow {
  return {
    id: "q-1",
    userId: "u-1",
    trackingId: "VPL26050001",
    complaintStatus: "queued",
    complaintId: null,
    dueDate: new Date(seedNow.getTime() + (24 * 60 * 60 * 1000)),
    retryCount: 0,
    nextRetryAt: new Date(seedNow),
    lastError: null,
    payloadJson: { tracking_number: "VPL26050001", phone: "03001234567", complaint_text: "Pending" },
    updatedAt: new Date(seedNow),
    createdAt: new Date(seedNow),
    ...(partial ?? {}),
  };
}

async function withPrismaQueueMock(input: {
  queueRows?: QueueRow[];
  shipmentComplaintText?: string | null;
  shipmentComplaintStatus?: string | null;
}, run: (ctx: { queueRows: QueueRow[] }) => Promise<void>) {
  const queueRows = input.queueRows ? [...input.queueRows] : [];

  const p = prisma as any;
  const original = {
    complaintQueue: p.complaintQueue,
    shipment: p.shipment,
  };

  p.complaintQueue = {
    findMany: async ({ where }: any) => {
      const statuses: string[] = where?.complaintStatus?.in ?? [];
      const singleStatus: string | undefined = where?.complaintStatus && typeof where.complaintStatus === "string" ? where.complaintStatus : undefined;
      const now = where?.nextRetryAt?.lte;
      const updatedBefore: Date | undefined = where?.updatedAt?.lt;
      const filtered = queueRows.filter((row) => {
        const byUser = !where?.userId || row.userId === where.userId;
        const byTracking = !where?.trackingId || row.trackingId === where.trackingId;
        const byStatus = singleStatus
          ? row.complaintStatus === singleStatus
          : statuses.length === 0 || statuses.includes(row.complaintStatus);
        const byRetry = !now || (row.nextRetryAt != null && row.nextRetryAt <= now);
        const byUpdatedBefore = !updatedBefore || row.updatedAt < updatedBefore;
        return byUser && byTracking && byStatus && byRetry && byUpdatedBefore;
      });
      return filtered.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
    create: async ({ data }: any) => {
      const row = makeQueueRow({
        id: `q-${queueRows.length + 1}`,
        userId: data.userId,
        trackingId: data.trackingId,
        complaintStatus: data.complaintStatus,
        retryCount: data.retryCount,
        nextRetryAt: data.nextRetryAt,
        payloadJson: data.payloadJson,
      });
      queueRows.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = queueRows.find((item) => item.id === where.id);
      if (!row) throw new Error("queue row missing");
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
    findUnique: async ({ where }: any) => queueRows.find((item) => item.id === where.id) ?? null,
  };

  p.shipment = {
    findUnique: async () => ({
      complaintStatus: input.shipmentComplaintStatus ?? null,
      complaintText: input.shipmentComplaintText ?? null,
    }),
  };

  try {
    await run({ queueRows });
  } finally {
    p.complaintQueue = original.complaintQueue;
    p.shipment = original.shipment;
  }
}

const tests: TestCase[] = [
  {
    name: "normalizes legacy retrying status",
    run() {
      assert.equal(normalizeComplaintQueueStatus("retrying"), "retry_pending");
      assert.equal(normalizeComplaintQueueStatus("queued"), "queued");
      assert.equal(normalizeComplaintQueueStatus(""), "queued");
    },
  },
  {
    name: "detects active duplicate from queue rows",
    async run() {
      // Use a fresh updatedAt so the row is not classified as stale (> 10 min old).
      await withPrismaQueueMock({
        queueRows: [makeQueueRow({ complaintStatus: "processing", complaintId: "CMP-1001", updatedAt: new Date() })],
      }, async () => {
        const duplicate = await findActiveComplaintDuplicate("u-1", "VPL26050001");
        assert.equal(duplicate.duplicate, true);
        assert.equal(duplicate.source, "queue");
        assert.equal(duplicate.complaintId, "CMP-1001");
      });
    },
  },
  {
    name: "detects active duplicate from shipment complaint metadata",
    async run() {
      const dueFuture = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
      await withPrismaQueueMock({
        queueRows: [],
        shipmentComplaintStatus: "FILED",
        shipmentComplaintText: `COMPLAINT_ID: CMP-555 | DUE_DATE: ${dueFuture} | COMPLAINT_STATE: ACTIVE`,
      }, async () => {
        const duplicate = await findActiveComplaintDuplicate("u-1", "VPL26050001");
        assert.equal(duplicate.duplicate, true);
        assert.equal(duplicate.source, "shipment");
        assert.equal(duplicate.complaintId, "CMP-555");
      });
    },
  },
  {
    name: "enqueues complaint with queued defaults",
    async run() {
      await withPrismaQueueMock({}, async ({ queueRows }) => {
        const created = await enqueueComplaint({
          userId: "u-1",
          trackingId: "VPL26050001",
          payload: {
            tracking_number: "VPL26050001",
            phone: "03001234567",
            complaint_text: "Pending delivery",
          },
        });

        assert.equal(created.complaintStatus, "queued");
        assert.equal(created.retryCount, 0);
        assert.equal(queueRows.length, 1);
      });
    },
  },
  {
    name: "marks processing and clears last error",
    async run() {
      await withPrismaQueueMock({
        queueRows: [makeQueueRow({ id: "q-9", complaintStatus: "retry_pending", lastError: "old" })],
      }, async ({ queueRows }) => {
        await markComplaintQueueProcessing("q-9");
        assert.equal(queueRows[0]?.complaintStatus, "processing");
        assert.equal(queueRows[0]?.lastError, null);
      });
    },
  },
  {
    name: "marks success with submitted state and stores complaint id and due date",
    async run() {
      const dueDate = new Date("2026-06-05T00:00:00.000Z");
      await withPrismaQueueMock({
        queueRows: [makeQueueRow({ id: "q-10" })],
      }, async ({ queueRows }) => {
        await markComplaintQueueSuccess({ id: "q-10", complaintId: "CMP-900", dueDate, status: "submitted" });
        assert.equal(queueRows[0]?.complaintStatus, "submitted");
        assert.equal(queueRows[0]?.complaintId, "CMP-900");
        assert.equal(queueRows[0]?.dueDate?.toISOString(), dueDate.toISOString());
      });
    },
  },
  {
    name: "marks failure with retry state then transitions to manual review at max retries",
    async run() {
      await withPrismaQueueMock({
        queueRows: [
          makeQueueRow({ id: "q-11", retryCount: 0, complaintStatus: "processing" }),
          makeQueueRow({ id: "q-12", retryCount: COMPLAINT_MAX_RETRIES - 1, complaintStatus: "processing" }),
        ],
      }, async ({ queueRows }) => {
        const first = await markComplaintQueueFailure("q-11", "transient issue");
        assert.equal(first.status, "retry_pending");
        assert.equal(queueRows[0]?.retryCount, 1);
        assert.equal(queueRows[0]?.complaintStatus, "retry_pending");

        const last = await markComplaintQueueFailure("q-12", "final issue");
        assert.equal(last.status, "manual_review");
        assert.equal(queueRows[1]?.complaintStatus, "manual_review");
        assert.equal(queueRows[1]?.nextRetryAt, null);
      });
    },
  },
  {
    name: "lists queued complaints eligible for retry",
    async run() {
      await withPrismaQueueMock({
        queueRows: [
          makeQueueRow({ id: "q-21", complaintStatus: "queued", nextRetryAt: new Date(Date.now() - 1_000) }),
          makeQueueRow({ id: "q-22", complaintStatus: "retry_pending", nextRetryAt: new Date(Date.now() - 2_000) }),
          makeQueueRow({ id: "q-23", complaintStatus: "submitted", nextRetryAt: new Date(Date.now() - 2_000) }),
        ],
      }, async () => {
        const rows = await getQueuedComplaintsForRetry(25);
        assert.equal(rows.length, 2);
        assert.ok(rows.every((row) => ["queued", "retry_pending", "retrying"].includes(String(row.complaintStatus))));
      });
    },
  },
  {
    name: "keeps retry delay schedule bounded at max backoff",
    run() {
      const now = Date.now();
      const toMinutes = (date: Date) => Math.round((date.getTime() - now) / (60 * 1000));

      const retry1 = toMinutes(getComplaintNextRetryAt(1));
      const retry2 = toMinutes(getComplaintNextRetryAt(2));
      const retry3 = toMinutes(getComplaintNextRetryAt(3));
      const retry4 = toMinutes(getComplaintNextRetryAt(4));
      const retry5 = toMinutes(getComplaintNextRetryAt(5));
      const retry9 = toMinutes(getComplaintNextRetryAt(9));

      assert.ok(retry1 >= 4 && retry1 <= 6);
      assert.ok(retry2 >= 14 && retry2 <= 16);
      assert.ok(retry3 >= 29 && retry3 <= 31);
      assert.ok(retry4 >= 59 && retry4 <= 61);
      assert.ok(retry5 >= 179 && retry5 <= 181);
      assert.ok(retry9 >= 179 && retry9 <= 181);
    },
  },
  // ── Reopen / stuck-processing tests (2026-06-03) ─────────────────────────
  {
    name: "reopen: enqueues a new complaint queue row independent of resolved history",
    async run() {
      await withPrismaQueueMock({
        queueRows: [],
        shipmentComplaintStatus: "FILED",
        shipmentComplaintText: "COMPLAINT_STATE: RESOLVED | COMPLAINT_ID: CMP-100",
      }, async ({ queueRows }) => {
        const row = await enqueueComplaint({
          userId: "u-1",
          trackingId: "VPL26040379",
          payload: {
            tracking_number: "VPL26040379",
            phone: "03001234567",
            complaint_text: "Still not delivered, reopening complaint",
            attempt_number: 2,
            previous_complaint_reference: "CMP-100",
          },
        });
        assert.equal(row.complaintStatus, "queued");
        assert.equal(row.retryCount, 0);
        assert.equal(queueRows.length, 1);
      });
    },
  },
  {
    name: "stuck processing: rescue transitions stale processing row to retry_pending",
    async run() {
      const staleUpdatedAt = new Date(Date.now() - COMPLAINT_PROCESSING_STALE_AFTER_MS - 60_000);
      await withPrismaQueueMock({
        queueRows: [
          makeQueueRow({ id: "q-stale", complaintStatus: "processing", retryCount: 0, updatedAt: staleUpdatedAt }),
        ],
      }, async ({ queueRows }) => {
        const result = await rescueStuckProcessingComplaints();
        assert.equal(result.rescued, 1);
        assert.equal(queueRows[0]?.complaintStatus, "retry_pending");
        assert.ok(queueRows[0]?.nextRetryAt != null);
        assert.ok(String(queueRows[0]?.lastError ?? "").includes("Processing timeout"));
      });
    },
  },
  {
    name: "stuck processing: rescue transitions to manual_review when retries exhausted",
    async run() {
      const staleUpdatedAt = new Date(Date.now() - COMPLAINT_PROCESSING_STALE_AFTER_MS - 60_000);
      await withPrismaQueueMock({
        queueRows: [
          makeQueueRow({ id: "q-maxed", complaintStatus: "processing", retryCount: COMPLAINT_MAX_RETRIES - 1, updatedAt: staleUpdatedAt }),
        ],
      }, async ({ queueRows }) => {
        const result = await rescueStuckProcessingComplaints();
        assert.equal(result.rescued, 1);
        assert.equal(queueRows[0]?.complaintStatus, "manual_review");
        assert.equal(queueRows[0]?.nextRetryAt, null);
      });
    },
  },
  {
    name: "stuck processing: fresh processing row is not rescued",
    async run() {
      const freshUpdatedAt = new Date(Date.now() - 60_000); // 1 minute old, within stale threshold
      await withPrismaQueueMock({
        queueRows: [
          makeQueueRow({ id: "q-fresh", complaintStatus: "processing", retryCount: 0, updatedAt: freshUpdatedAt }),
        ],
      }, async ({ queueRows }) => {
        const result = await rescueStuckProcessingComplaints();
        assert.equal(result.rescued, 0);
        assert.equal(queueRows[0]?.complaintStatus, "processing");
      });
    },
  },
  {
    name: "duplicate check: stale processing row does not block new complaint submission",
    async run() {
      const staleUpdatedAt = new Date(Date.now() - COMPLAINT_PROCESSING_STALE_AFTER_MS - 60_000);
      await withPrismaQueueMock({
        queueRows: [
          makeQueueRow({ id: "q-stale2", complaintStatus: "processing", updatedAt: staleUpdatedAt, dueDate: null }),
        ],
      }, async () => {
        const duplicate = await findActiveComplaintDuplicate("u-1", "VPL26050001");
        assert.equal(duplicate.duplicate, false, "stale processing row should not block new submission");
      });
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS complaint queue: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL complaint queue: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`complaint queue tests passed: ${tests.length}`);
}
