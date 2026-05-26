import assert from "node:assert/strict";
import { Queue } from "bullmq";

process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const { handleTrackingBulk } = await import("./tracking.js");
const { prisma } = await import("../lib/prisma.js");
const { redis } = await import("../lib/redis.js");

type RouteMockState = {
  userId: string;
  trackingJobCreates: any[];
  trackingJobUpdates: any[];
  shipmentCreates: any[];
  shipmentUpdates: any[];
  queueAddCalls: any[];
  redisSetCalls: any[];
};

function makeState(): RouteMockState {
  return {
    userId: "tracking-route-user-1",
    trackingJobCreates: [],
    trackingJobUpdates: [],
    shipmentCreates: [],
    shipmentUpdates: [],
    queueAddCalls: [],
    redisSetCalls: [],
  };
}

async function withRouteMocks(state: RouteMockState, run: () => Promise<void>) {
  const p = prisma as any;
  const r = redis as any;

  const originalPrisma = {
    $connect: p.$connect,
    $executeRaw: p.$executeRaw,
    $queryRaw: p.$queryRaw,
    $transaction: p.$transaction,
    trackingJob: p.trackingJob,
    shipment: p.shipment,
  };

  const originalRedis = {
    set: r.set,
    get: r.get,
    del: r.del,
    ping: r.ping,
    connect: r.connect,
  };

  const originalQueueAdd = Queue.prototype.add;

  const tx = {
    subscription: {
      findFirst: async () => ({
        userId: state.userId,
        status: "ACTIVE",
        planId: "plan-standard",
        currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000),
        plan: {
          monthlyLabelLimit: 1000,
          monthlyTrackingLimit: 1000,
        },
        user: {
          extraLabelCredits: 0,
          extraTrackingCredits: 0,
        },
      }),
    },
    usageMonthly: {
      findUnique: async () => null,
      upsert: async ({ create }: any) => ({
        labelsGenerated: 0,
        labelsQueued: Number(create.labelsQueued ?? 0),
        trackingGenerated: 0,
        trackingQueued: Number(create.trackingQueued ?? 0),
      }),
    },
    $queryRaw: async () => [],
    $executeRaw: async () => 1,
  };

  p.$connect = async () => {};
  p.$executeRaw = async () => 1;
  p.$queryRaw = async () => [];
  p.$transaction = async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx);

  p.trackingJob = {
    create: async ({ data }: any) => {
      state.trackingJobCreates.push(data);
      return {
        id: "tracking-job-1",
        ...data,
      };
    },
    update: async ({ where, data }: any) => {
      state.trackingJobUpdates.push({ where, data });
      return { id: where.id, ...data };
    },
  };

  p.shipment = {
    findMany: async () => [],
    createMany: async ({ data }: any) => {
      state.shipmentCreates.push(data);
      return { count: Array.isArray(data) ? data.length : 0 };
    },
    updateMany: async ({ where, data }: any) => {
      state.shipmentUpdates.push({ where, data });
      return { count: 1 };
    },
  };

  r.set = async (...args: unknown[]) => {
    state.redisSetCalls.push(args);
    return "OK";
  };
  r.get = async () => null;
  r.del = async () => 1;
  r.ping = async () => "PONG";
  r.connect = async () => {};

  (Queue.prototype as any).add = async function (...args: unknown[]) {
    state.queueAddCalls.push(args);
    return { id: "queue-job-1" };
  };

  try {
    await run();
  } finally {
    p.$connect = originalPrisma.$connect;
    p.$executeRaw = originalPrisma.$executeRaw;
    p.$queryRaw = originalPrisma.$queryRaw;
    p.$transaction = originalPrisma.$transaction;
    p.trackingJob = originalPrisma.trackingJob;
    p.shipment = originalPrisma.shipment;

    r.set = originalRedis.set;
    r.get = originalRedis.get;
    r.del = originalRedis.del;
    r.ping = originalRedis.ping;
    r.connect = originalRedis.connect;

    Queue.prototype.add = originalQueueAdd;
  }
}

function makeRes() {
  const state: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: any) {
      state.body = payload;
      return res;
    },
  };
  return { res, state };
}

const tests: TestCase[] = [
  {
    name: "queues valid synthetic tracking upload and persists expected record count",
    async run() {
      const state = makeState();
      const { res, state: response } = makeRes();

      const req: any = {
        body: {
          tracking_numbers: ["VPL26050001", "PAR26050002"],
        },
        file: undefined,
        user: { id: state.userId, role: "USER" },
        header: (name: string) => (name.toLowerCase() === "x-idempotency-key" ? "idem-1" : undefined),
      };

      await withRouteMocks(state, async () => {
        await handleTrackingBulk(req, res as any);
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.body?.success, true);
      assert.equal(response.body?.queued, true);
      assert.equal(response.body?.recordCount, 2);
      assert.equal(response.body?.jobId, "tracking-job-1");

      assert.equal(state.trackingJobCreates.length, 1);
      assert.equal(state.trackingJobUpdates.length >= 1, true);
      assert.equal(state.queueAddCalls.length, 1);
      assert.equal(state.shipmentCreates.length, 1);

      const queuePayload = state.queueAddCalls[0]?.[1] ?? {};
      assert.equal(queuePayload.kind, "BULK_TRACK");
      assert.deepEqual(queuePayload.trackingNumbers, ["VPL26050001", "PAR26050002"]);

      const finalUpdate = state.trackingJobUpdates[state.trackingJobUpdates.length - 1];
      assert.equal(finalUpdate?.data?.recordCount, 2);
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS tracking route: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL tracking route: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`tracking route tests passed: ${tests.length}`);
}
