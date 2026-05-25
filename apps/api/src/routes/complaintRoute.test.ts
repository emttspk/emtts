import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { trackingQueue } from "../queue/queue.js";
import { trackingRouter } from "./tracking.js";

type UsageLogRow = {
  user_id: string;
  action_type: string;
  request_key: string;
  status: "CONSUMED" | "REFUNDED";
  units_used: number;
  created_at: string;
};

type RouteMockState = {
  userId: string;
  role: "USER" | "ADMIN";
  planName: string;
  planId: string;
  labelLimit: number;
  trackingLimit: number;
  extraLabelCredits: number;
  extraTrackingCredits: number;
  usageMonthly: {
    labelsGenerated: number;
    labelsQueued: number;
    trackingGenerated: number;
    trackingQueued: number;
  };
  usageLogs: UsageLogRow[];
  shipmentRow: any | null;
  queueDuplicates: any[];
  queueCreates: any[];
  queueAddCalls: any[];
  queueAddShouldFail: boolean;
  trackingJobCreates: any[];
  shipmentUpserts: any[];
};

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const complaintRouteLayer = (trackingRouter as any).stack.find((layer: any) => layer?.route?.path === "/complaint" && layer?.route?.methods?.post);
if (!complaintRouteLayer) {
  throw new Error("complaint route not found");
}
const complaintHandler = complaintRouteLayer.route.stack[1].handle as (req: any, res: any) => Promise<unknown>;

function makeState(overrides?: Partial<RouteMockState>): RouteMockState {
  return {
    userId: "route-user-1",
    role: "USER",
    planName: "Standard",
    planId: "plan-standard",
    labelLimit: 1000,
    trackingLimit: 1000,
    extraLabelCredits: 0,
    extraTrackingCredits: 0,
    usageMonthly: {
      labelsGenerated: 0,
      labelsQueued: 0,
      trackingGenerated: 0,
      trackingQueued: 0,
    },
    usageLogs: [],
    shipmentRow: null,
    queueDuplicates: [],
    queueCreates: [],
    queueAddCalls: [],
    queueAddShouldFail: false,
    trackingJobCreates: [],
    shipmentUpserts: [],
    ...(overrides ?? {}),
  };
}

function makePendingShipment(trackingNumber = "VPL26050001", complaintText: string | null = null, complaintStatus: string | null = null) {
  return {
    daysPassed: 10,
    rawJson: JSON.stringify({
      tracking: {
        history: [
          ["2026-05-01", "09:00", "Booked at counter", "Lahore Booking Office"],
        ],
      },
      sender_name: "Sender One",
      sender_address: "Addr S",
      receiver_name: "Receiver One",
      receiver_address: "Addr R",
      booking_city: "Lahore",
      receiver_city: "Karachi",
    }),
    trackingNumber,
    complaintStatus,
    complaintText,
    city: "Karachi",
    latestDate: "2026-05-02",
  };
}

function makeDeliveredShipment(trackingNumber = "UMS26050001") {
  return {
    ...makePendingShipment(trackingNumber),
    rawJson: JSON.stringify({
      tracking: {
        history: [
          ["2026-05-01", "09:00", "Delivered to addressee", "Karachi Delivery Office"],
        ],
      },
      sender_name: "Sender One",
      sender_address: "Addr S",
      receiver_name: "Receiver One",
      receiver_address: "Addr R",
      booking_city: "Lahore",
      receiver_city: "Karachi",
    }),
  };
}

function defaultBody(overrides?: Record<string, unknown>) {
  return {
    tracking_number: "VPL26050001",
    phone: "03001234567",
    complaint_text: "Pending for too long",
    sender_name: "Sender One",
    sender_address: "Addr S",
    sender_city_value: "Lahore",
    receiver_name: "Receiver One",
    receiver_address: "Addr R",
    receiver_city_value: "Karachi",
    recipient_city_value: "Karachi",
    recipient_district: "Karachi",
    recipient_tehsil: "Saddar",
    recipient_location: "Karachi GPO",
    ...overrides,
  };
}

async function withRouteMocks(state: RouteMockState, run: () => Promise<void>) {
  const p = prisma as any;
  const originalPrisma = {
    $connect: p.$connect,
    $queryRaw: p.$queryRaw,
    $executeRaw: p.$executeRaw,
    $executeRawUnsafe: p.$executeRawUnsafe,
    $queryRawUnsafe: p.$queryRawUnsafe,
    $transaction: p.$transaction,
    shipment: p.shipment,
    complaintQueue: p.complaintQueue,
    trackingJob: p.trackingJob,
    user: p.user,
    subscription: p.subscription,
    usageMonthly: p.usageMonthly,
  };
  const originalQueueAdd = (trackingQueue as any).add;

  const countDailyComplaints = () => {
    const today = new Date().toISOString().slice(0, 10);
    return state.usageLogs.filter((row) => row.action_type === "complaint" && row.status === "CONSUMED" && row.created_at.slice(0, 10) === today).length;
  };
  const countMonthlyComplaints = () => {
    const month = new Date().toISOString().slice(0, 7);
    return state.usageLogs.filter((row) => row.action_type === "complaint" && row.status === "CONSUMED" && row.created_at.slice(0, 7) === month).length;
  };

  const queryRawImpl = async (query: TemplateStringsArray | string) => {
    const sql = Array.isArray(query) ? query.join(" ") : String(query);
    if (sql.includes("FROM money_orders")) return [];
    if (sql.includes("FROM \"Plan\"")) return [{ daily_complaint_limit: null, monthly_complaint_limit: null }];
    if (sql.includes("DATE(created_at::timestamp)")) return [{ count: countDailyComplaints() }];
    if (sql.includes("TO_CHAR(created_at::timestamp AT TIME ZONE 'UTC', 'YYYY-MM')")) return [{ count: countMonthlyComplaints() }];
    if (sql.includes("SELECT action_type, request_key, status FROM usage_logs")) {
      return state.usageLogs.map((row) => ({ action_type: row.action_type, request_key: row.request_key, status: row.status }));
    }
    return [];
  };

  const executeRawImpl = async (query: TemplateStringsArray | string, ...values: unknown[]) => {
    const sql = Array.isArray(query) ? query.join(" ") : String(query);
    if (sql.includes("INSERT INTO usage_logs")) {
      const userId = String(values[1] ?? "");
      const actionType = String(values[2] ?? "");
      const unitsUsed = Number(values[3] ?? 1);
      const requestKey = String(values[4] ?? "");
      const exists = state.usageLogs.some((row) => row.user_id === userId && row.action_type === actionType && row.request_key === requestKey);
      if (!exists) {
        state.usageLogs.push({
          user_id: userId,
          action_type: actionType,
          request_key: requestKey,
          status: "CONSUMED",
          units_used: unitsUsed,
          created_at: new Date().toISOString(),
        });
      }
      return 1;
    }
    if (sql.includes("UPDATE usage_logs")) {
      const userId = String(values[0] ?? "");
      const actionType = String(values[1] ?? "");
      const requestKey = String(values[2] ?? "");
      for (const row of state.usageLogs) {
        if (row.user_id === userId && row.action_type === actionType && row.request_key === requestKey && row.status === "CONSUMED") {
          row.status = "REFUNDED";
        }
      }
      return 1;
    }
    return 1;
  };

  const tx = {
    subscription: {
      findFirst: async () => ({
        userId: state.userId,
        status: "ACTIVE",
        planId: state.planId,
        currentPeriodEnd: new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)),
        plan: {
          name: state.planName,
          monthlyLabelLimit: state.labelLimit,
          monthlyTrackingLimit: state.trackingLimit,
        },
        user: {
          extraLabelCredits: state.extraLabelCredits,
          extraTrackingCredits: state.extraTrackingCredits,
        },
      }),
    },
    usageMonthly: {
      findUnique: async () => state.usageMonthly,
      upsert: async ({ create, update }: any) => {
        if (state.usageMonthly.labelsGenerated === 0 && state.usageMonthly.labelsQueued === 0 && state.usageMonthly.trackingGenerated === 0 && state.usageMonthly.trackingQueued === 0) {
          state.usageMonthly.labelsGenerated = Number(create.labelsGenerated ?? 0);
          state.usageMonthly.labelsQueued = Number(create.labelsQueued ?? 0);
          state.usageMonthly.trackingGenerated = Number(create.trackingGenerated ?? 0);
          state.usageMonthly.trackingQueued = Number(create.trackingQueued ?? 0);
        } else {
          state.usageMonthly.labelsGenerated += Number(update.labelsGenerated?.increment ?? 0);
          state.usageMonthly.labelsQueued += Number(update.labelsQueued?.increment ?? 0);
          state.usageMonthly.trackingGenerated += Number(update.trackingGenerated?.increment ?? 0);
          state.usageMonthly.trackingQueued += Number(update.trackingQueued?.increment ?? 0);
        }
        return state.usageMonthly;
      },
      updateMany: async ({ where, data }: any) => {
        const decLabels = Number(data?.labelsQueued?.decrement ?? 0);
        const decTracking = Number(data?.trackingQueued?.decrement ?? 0);
        const gteLabels = Number(where?.labelsQueued?.gte ?? 0);
        const gteTracking = Number(where?.trackingQueued?.gte ?? 0);
        if (state.usageMonthly.labelsQueued >= gteLabels && state.usageMonthly.trackingQueued >= gteTracking) {
          state.usageMonthly.labelsQueued -= decLabels;
          state.usageMonthly.trackingQueued -= decTracking;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    $queryRaw: queryRawImpl,
    $executeRaw: executeRawImpl,
  };

  p.$connect = async () => {};
  p.$queryRaw = queryRawImpl;
  p.$executeRaw = executeRawImpl;
  p.$executeRawUnsafe = async () => 1;
  p.$queryRawUnsafe = async () => [];
  p.$transaction = async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx);
  p.shipment = {
    findFirst: async ({ where }: any) => {
      if (!state.shipmentRow) return null;
      return state.shipmentRow.trackingNumber === where.trackingNumber ? state.shipmentRow : null;
    },
    findUnique: async () => {
      if (!state.shipmentRow) return null;
      return {
        complaintStatus: state.shipmentRow.complaintStatus,
        complaintText: state.shipmentRow.complaintText,
      };
    },
    upsert: async (args: any) => {
      state.shipmentUpserts.push(args);
      return args.update;
    },
  };
  p.complaintQueue = {
    findMany: async () => state.queueDuplicates,
    create: async ({ data }: any) => {
      state.queueCreates.push(data);
      return { id: `cq-${state.queueCreates.length}`, ...data };
    },
  };
  p.trackingJob = {
    create: async ({ data }: any) => {
      state.trackingJobCreates.push(data);
      return { id: `tj-${state.trackingJobCreates.length}`, status: "QUEUED" };
    },
  };
  p.user = {
    findUnique: async ({ select }: any) => {
      if (select?.companyName) {
        return {
          companyName: "Sender Co",
          address: "addr",
          contactNumber: "03001234567",
          originCity: "Lahore",
          email: "sender@example.com",
        };
      }
      return {
        extraLabelCredits: state.extraLabelCredits,
        extraTrackingCredits: state.extraTrackingCredits,
        role: state.role,
      };
    },
  };
  p.subscription = {
    findFirst: tx.subscription.findFirst,
  };
  p.usageMonthly = {
    findUnique: tx.usageMonthly.findUnique,
    upsert: tx.usageMonthly.upsert,
    updateMany: tx.usageMonthly.updateMany,
  };

  (trackingQueue as any).add = async (...args: unknown[]) => {
    state.queueAddCalls.push(args);
    if (state.queueAddShouldFail) {
      throw new Error("queue add failed");
    }
    return { id: "job-added" };
  };

  try {
    await run();
  } finally {
    p.$connect = originalPrisma.$connect;
    p.$queryRaw = originalPrisma.$queryRaw;
    p.$executeRaw = originalPrisma.$executeRaw;
    p.$executeRawUnsafe = originalPrisma.$executeRawUnsafe;
    p.$queryRawUnsafe = originalPrisma.$queryRawUnsafe;
    p.$transaction = originalPrisma.$transaction;
    p.shipment = originalPrisma.shipment;
    p.complaintQueue = originalPrisma.complaintQueue;
    p.trackingJob = originalPrisma.trackingJob;
    p.user = originalPrisma.user;
    p.subscription = originalPrisma.subscription;
    p.usageMonthly = originalPrisma.usageMonthly;
    (trackingQueue as any).add = originalQueueAdd;
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

async function runComplaintRoute(input: {
  state: RouteMockState;
  body: Record<string, unknown>;
  role?: "USER" | "ADMIN";
}) {
  const req: any = {
    body: input.body,
    user: { id: input.state.userId, role: input.role ?? input.state.role },
  };
  const { res, state } = makeRes();
  let thrown: unknown = null;
  await withRouteMocks(input.state, async () => {
    try {
      await complaintHandler(req, res);
    } catch (error) {
      thrown = error;
    }
  });
  return { statusCode: state.statusCode, body: state.body, thrown };
}

const tests: TestCase[] = [
  {
    name: "route rejects missing tracking number",
    async run() {
      const result = await runComplaintRoute({
        state: makeState(),
        body: defaultBody({ tracking_number: " " }),
      });
      assert.equal(result.statusCode, 400);
      assert.match(String(result.body?.message ?? ""), /Article number is required/i);
    },
  },
  {
    name: "route rejects invalid tracking number payload shape",
    async run() {
      const result = await runComplaintRoute({
        state: makeState(),
        body: defaultBody({ tracking_number: "X".repeat(81) }),
      });
      assert.ok(result.thrown instanceof Error);
    },
  },
  {
    name: "route accepts eligible pending shipment and queues complaint",
    async run() {
      const state = makeState({ shipmentRow: makePendingShipment() });
      const result = await runComplaintRoute({ state, body: defaultBody() });
      assert.equal(result.statusCode, 200);
      assert.equal(result.body?.queued, true);
      assert.equal(state.queueCreates.length, 1);
      assert.equal(state.trackingJobCreates.length, 1);
      assert.equal(state.queueAddCalls.length, 1);
    },
  },
  {
    name: "route handles delivered-like shipment status based on current lifecycle mapping",
    async run() {
      const state = makeState({ shipmentRow: makeDeliveredShipment("UMS26050001") });
      const result = await runComplaintRoute({ state, body: defaultBody({ tracking_number: "UMS26050001" }) });
      assert.equal(result.statusCode, 200);
      assert.equal(result.body?.queued, true);
    },
  },
  {
    name: "route rejects duplicate active complaint",
    async run() {
      const dueFuture = new Date(Date.now() + (24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
      const state = makeState({
        shipmentRow: makePendingShipment("VPL26050001", `COMPLAINT_ID: CMP-111 | DUE_DATE: ${dueFuture} | COMPLAINT_STATE: ACTIVE`, "FILED"),
      });
      const before = state.usageLogs.length;
      const result = await runComplaintRoute({ state, body: defaultBody() });
      assert.equal(result.statusCode, 409);
      assert.equal(state.usageLogs.length, before);
    },
  },
  {
    name: "route rejects allowance blocked complaint",
    async run() {
      const now = new Date().toISOString();
      const state = makeState({
        shipmentRow: makePendingShipment(),
        usageLogs: Array.from({ length: 5 }).map((_, i) => ({
          user_id: "route-user-1",
          action_type: "complaint",
          request_key: `r-${i}`,
          status: "CONSUMED" as const,
          units_used: 10,
          created_at: now,
        })),
      });
      const before = state.usageLogs.length;
      const result = await runComplaintRoute({ state, body: defaultBody() });
      assert.equal(result.statusCode, 429);
      assert.equal(state.usageLogs.length, before);
    },
  },
  {
    name: "rejected validation consumes zero units",
    async run() {
      const state = makeState({ shipmentRow: makePendingShipment() });
      const before = state.usageLogs.length;
      const result = await runComplaintRoute({
        state,
        body: defaultBody({ complaint_text: "" }),
      });
      assert.equal(result.statusCode, 400);
      assert.equal(state.usageLogs.length, before);
    },
  },
  {
    name: "accepted complaint creates queue payload with expected fields",
    async run() {
      const state = makeState({ shipmentRow: makePendingShipment() });
      const result = await runComplaintRoute({ state, body: defaultBody() });
      assert.equal(result.statusCode, 200);
      const payload = state.queueCreates[0]?.payloadJson;
      assert.ok(payload);
      assert.equal(payload?.tracking_number, "VPL26050001");
      assert.equal(payload?.phone, "03001234567");
      assert.ok(String(payload?.complaint_text ?? "").length > 0);
      const consumedComplaint = state.usageLogs.find((row) => row.action_type === "complaint" && row.status === "CONSUMED");
      assert.ok(consumedComplaint);
      assert.equal(consumedComplaint?.units_used, 10);
    },
  },
  {
    name: "queue enqueue failure returns safe error and refunds complaint units",
    async run() {
      const state = makeState({ shipmentRow: makePendingShipment(), queueAddShouldFail: true });
      const result = await runComplaintRoute({ state, body: defaultBody() });
      assert.equal(result.statusCode, 500);
      const refunded = state.usageLogs.find((row) => row.action_type === "complaint" && row.status === "REFUNDED");
      assert.ok(refunded);
      assert.equal(state.usageMonthly.labelsQueued, 0);
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS complaint route: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL complaint route: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log(`complaint route tests passed: ${tests.length}`);
  process.exit(0);
}
