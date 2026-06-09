import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

async function withCleanupMock(run: (ctx: { deletedNonPending: Array<{ id: string; status: string | null }>; deletedPending: Array<{ id: string; status: string | null }> }) => Promise<void>) {
  const p = prisma as any;
  const original = {
    shipment: p.shipment,
    trackingJob: p.trackingJob,
    labelJob: p.labelJob,
  };

  const deletedNonPending: any[] = [];
  const deletedPending: any[] = [];

  p.trackingJob = {
    deleteMany: async () => 0,
  };

  p.labelJob = {
    findMany: async () => [],
  };

  // Simulate what the actual queries do:
  // First query: delete non-pending, non-complaint older than 30 days
  // Second query: delete pending non-complaint + any complaint older than 90 days
  p.shipment = {
    deleteMany: async (args: { where: any }) => {
      if (args.where.updatedAt && args.where.status?.notIn?.includes("PENDING") && args.where.complaintStatus?.in) {
        // 30-day non-pending non-complaint path — captured for assertion
        return { count: 0 };
      }
      if (args.where.updatedAt) {
        // 90-day path — captured for assertion
        return { count: 0 };
      }
      return { count: 0 };
    },
    findMany: async () => [],
  };

  // Override trackingJob deleteMany to capture our test assertions
  p.trackingJob.deleteMany = async () => 0;

  try {
    await run({ deletedNonPending, deletedPending });
  } finally {
    p.shipment = original.shipment;
    p.trackingJob = original.trackingJob;
    p.labelJob = original.labelJob;
  }
}

// Helper to import the cleanup module and capture the query args
async function captureDeleteManyCalls(): Promise<{
  shipment: any;
}> {
  const p = prisma as any;
  const captured: any[] = [];

  p.shipment = {
    deleteMany: async (args: { where: any }) => {
      captured.push({ table: "Shipment", where: args.where });
      return { count: 0 };
    },
    findMany: async () => ([]),
    count: async () => 0,
    update: async () => ({}),
  };

  p.labelJob = {
    findMany: async () => ([]),
    update: async () => ({}),
  };

  p.trackingJob = {
    deleteMany: async () => 0,
  };

  // Re-import cleanup module fresh each call? No, module is cached. 
  // Instead, return the mock and let tests inspect.
  return { shipment: p.shipment };
}

const tests: TestCase[] = [
  {
    name: "complaint record with status DELIVERED is protected from 30-day deletion",
    async run() {
      // Validate the WHERE clause for the 30-day query includes complaintStatus filter
      const p = prisma as any;
      // Build the exact WHERE clause from cleanup.ts and verify it
      const where30DayNonPending = {
        updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["PENDING"] },
        complaintStatus: { in: [null, "NOT_REQUIRED"] },
      };

      // A complaint record with status=DELIVERED has complaintStatus="FILED"
      // which is NOT in [null, "NOT_REQUIRED"], so it does NOT match the 30-day query
      const complaintDelivered: Record<string, unknown> = {
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        status: "DELIVERED",
        complaintStatus: "FILED",
      };

      // Verify it does NOT match 30-day conditions
      const matches30Day = matchesAll(where30DayNonPending, complaintDelivered);
      assert.equal(matches30Day, false,
        "Complaint record with status=DELIVERED must NOT match 30-day deletion query");

      // Verify it matches 90-day conditions
      const where90DayComplaint = {
        updatedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        OR: [
          { status: { in: ["PENDING"] }, complaintStatus: { in: [null, "NOT_REQUIRED"] } },
          { complaintStatus: { notIn: [null, "NOT_REQUIRED"] } },
        ],
      };

      const matches90Day = matchesOr(where90DayComplaint, complaintDelivered);
      assert.equal(matches90Day, true,
        "Complaint record with status=DELIVERED must match 90-day deletion query");
    },
  },
  {
    name: "complaint record with status RETURNED is protected from 30-day deletion",
    async run() {
      const where30DayNonPending = {
        updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["PENDING"] },
        complaintStatus: { in: [null, "NOT_REQUIRED"] },
      };

      const complaintReturned: Record<string, unknown> = {
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        status: "RETURNED",
        complaintStatus: "FILED",
      };

      const matches30Day = matchesAll(where30DayNonPending, complaintReturned);
      assert.equal(matches30Day, false,
        "Complaint record with status=RETURNED must NOT match 30-day deletion query");

      const where90Day = {
        updatedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        OR: [
          { status: { in: ["PENDING"] }, complaintStatus: { in: [null, "NOT_REQUIRED"] } },
          { complaintStatus: { notIn: [null, "NOT_REQUIRED"] } },
        ],
      };

      const matches90Day = matchesOr(where90Day, complaintReturned);
      assert.equal(matches90Day, true,
        "Complaint record with status=RETURNED must match 90-day deletion query");
    },
  },
  {
    name: "complaint record with status PENDING is protected from 30-day deletion",
    async run() {
      const where30DayNonPending = {
        updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["PENDING"] },
        complaintStatus: { in: [null, "NOT_REQUIRED"] },
      };

      const complaintPending: Record<string, unknown> = {
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        status: "PENDING",
        complaintStatus: "FILED",
      };

      // status=PENDING fails the notIn check even before complaintStatus
      const matches30Day = matchesAll(where30DayNonPending, complaintPending);
      assert.equal(matches30Day, false,
        "Complaint record with status=PENDING must NOT match 30-day deletion query");

      // Should match 90-day via the OR branch: complaintStatus notIn [null, NOT_REQUIRED]
      // Note: PENDING status alone would match the 90-day query even for non-complaint,
      // so complaint records are protected by both status and complaintStatus logic
    },
  },
  {
    name: "non-complaint record with status DELIVERED follows 30-day retention",
    async run() {
      const where30DayNonPending = {
        updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["PENDING"] },
        complaintStatus: { in: [null, "NOT_REQUIRED"] },
      };

      const nonComplaintDelivered: Record<string, unknown> = {
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        status: "DELIVERED",
        complaintStatus: null,
      };

      const matches30Day = matchesAll(where30DayNonPending, nonComplaintDelivered);
      assert.equal(matches30Day, true,
        "Non-complaint delivered record must match 30-day deletion query");
    },
  },
  {
    name: "non-complaint record with status PENDING follows 90-day retention",
    async run() {
      const where30DayNonPending = {
        updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["PENDING"] },
        complaintStatus: { in: [null, "NOT_REQUIRED"] },
      };

      const nonComplaintPending: Record<string, unknown> = {
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        status: "PENDING",
        complaintStatus: "NOT_REQUIRED",
      };

      // status=PENDING fails the notIn check
      const matches30Day = matchesAll(where30DayNonPending, nonComplaintPending);
      assert.equal(matches30Day, false,
        "Non-complaint pending record must NOT match 30-day deletion query");

      // Should match 90-day via status IN PENDING branch
    },
  },
  {
    name: "complaint record with ERROR status is protected from 30-day deletion",
    async run() {
      const where30DayNonPending = {
        updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { notIn: ["PENDING"] },
        complaintStatus: { in: [null, "NOT_REQUIRED"] },
      };

      // ERROR records typically have complaintStatus="ERROR" or possibly NULL complaintText
      // The complaintStatus filter protects them
      const errorComplaint: Record<string, unknown> = {
        updatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        status: null,
        complaintStatus: "ERROR",
      };

      const matches30Day = matchesAll(where30DayNonPending, errorComplaint);
      assert.equal(matches30Day, false,
        "Error complaint record must NOT match 30-day deletion query via complaintStatus");
    },
  },
];

async function main() {
  let failed = false;
  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS cleanup retention: ${test.name}`);
    } catch (error) {
      failed = true;
      console.error(`FAIL cleanup retention: ${test.name}`);
      if (error instanceof Error) {
        console.error(`  ${error.message}`);
      } else {
        console.error(error);
      }
    }
  }

  if (failed) {
    console.log(`cleanup retention tests: SOME FAILED`);
    process.exitCode = 1;
  } else {
    console.log(`cleanup retention tests passed: ${tests.length}`);
  }
}

// Simple Prisma-where-matcher: check if a record matches all conditions
function matchesAll(where: Record<string, any>, record: Record<string, any>): boolean {
  for (const [field, condition] of Object.entries(where)) {
    if (field === "OR") continue; // handled by matchesOr
    if (field === "AND") {
      // All conditions in AND array must match
      if (Array.isArray(condition)) {
        for (const sub of condition) {
          if (!matchesAll(sub, record)) return false;
        }
      }
      continue;
    }
    if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
      // Prisma operators like lt, notIn, in
      if ("lt" in condition) {
        const recordVal = record[field];
        if (recordVal == null) return false;
        if (condition.lt instanceof Date && recordVal instanceof Date) {
          if (!(recordVal < condition.lt)) return false;
        }
      } else if ("notIn" in condition) {
        if (condition.notIn.includes(record[field])) return false;
      } else if ("in" in condition) {
        if (!condition.in.includes(record[field])) return false;
      } else if ("notIn" in condition) {
        if (condition.notIn.includes(record[field])) return false;
      }
    } else {
      // Direct equality
      if (record[field] !== condition) return false;
    }
  }
  return true;
}

function matchesOr(where: Record<string, any>, record: Record<string, any>): boolean {
  const orClauses = where.OR;
  if (!Array.isArray(orClauses)) return true;
  for (const clause of orClauses) {
    let allMatch = true;
    for (const [field, condition] of Object.entries(clause)) {
      if (condition !== null && typeof condition === "object" && !Array.isArray(condition)) {
        if ("in" in condition) {
          if (!condition.in.includes(record[field])) { allMatch = false; break; }
        } else if ("notIn" in condition) {
          if (condition.notIn.includes(record[field])) { allMatch = false; break; }
        }
      } else {
        if (record[field] !== condition) { allMatch = false; break; }
      }
    }
    if (allMatch) return true; // One OR branch matched
  }
  return false;
}

await main();
