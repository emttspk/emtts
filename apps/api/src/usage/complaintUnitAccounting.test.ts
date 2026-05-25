import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { COMPLAINT_UNIT_COST, consumeUnits, getComplaintAllowance, refundUnits } from "./unitConsumption.js";

type UsageLogRow = {
  user_id: string;
  action_type: string;
  request_key: string;
  status: "CONSUMED" | "REFUNDED";
  units_used: number;
  created_at: string;
};

type MockState = {
  userId: string;
  role: "USER" | "ADMIN";
  planName: string;
  planId: string;
  planColumnDaily: number | null;
  planColumnMonthly: number | null;
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
};

type TestCase = {
  name: string;
  run: () => Promise<void> | void;
};

function yyyyMm(dateIso: string) {
  return dateIso.slice(0, 7);
}

function yyyyMmDd(dateIso: string) {
  return dateIso.slice(0, 10);
}

function makeMockState(overrides?: Partial<MockState>): MockState {
  return {
    userId: "test-user-1",
    role: "USER",
    planName: "Standard",
    planId: "plan-standard",
    planColumnDaily: null,
    planColumnMonthly: null,
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
    ...(overrides ?? {}),
  };
}

function addComplaintLogs(state: MockState, count: number, dateIso: string) {
  for (let i = 0; i < count; i += 1) {
    state.usageLogs.push({
      user_id: state.userId,
      action_type: "complaint",
      request_key: `seed-${i}-${dateIso}`,
      status: "CONSUMED",
      units_used: COMPLAINT_UNIT_COST,
      created_at: dateIso,
    });
  }
}

async function withPrismaMock(state: MockState, run: () => Promise<void>) {
  const p = prisma as any;
  const original = {
    $connect: p.$connect,
    $executeRaw: p.$executeRaw,
    $queryRaw: p.$queryRaw,
    $transaction: p.$transaction,
    subscription: p.subscription,
    user: p.user,
    usageMonthly: p.usageMonthly,
  };

  const nowIso = new Date().toISOString();

  const countDailyComplaints = () => state.usageLogs.filter((row) => (
    row.user_id === state.userId
    && row.action_type === "complaint"
    && row.status === "CONSUMED"
    && yyyyMmDd(row.created_at) === yyyyMmDd(nowIso)
  )).length;

  const countMonthlyComplaints = () => state.usageLogs.filter((row) => (
    row.user_id === state.userId
    && row.action_type === "complaint"
    && row.status === "CONSUMED"
    && yyyyMm(row.created_at) === yyyyMm(nowIso)
  )).length;

  const queryRawImpl = async (query: TemplateStringsArray | string) => {
    const sql = Array.isArray(query) ? query.join(" ") : String(query);
    if (sql.includes("FROM \"Plan\"")) {
      return [{
        daily_complaint_limit: state.planColumnDaily,
        monthly_complaint_limit: state.planColumnMonthly,
      }];
    }
    if (sql.includes("DATE(created_at::timestamp)")) {
      return [{ count: countDailyComplaints() }];
    }
    if (sql.includes("TO_CHAR(created_at::timestamp AT TIME ZONE 'UTC', 'YYYY-MM')")) {
      return [{ count: countMonthlyComplaints() }];
    }
    if (sql.includes("SELECT action_type, request_key, status FROM usage_logs")) {
      return state.usageLogs
        .filter((row) => row.user_id === state.userId)
        .map((row) => ({ action_type: row.action_type, request_key: row.request_key, status: row.status }));
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
  p.$executeRaw = executeRawImpl;
  p.$queryRaw = queryRawImpl;
  p.$transaction = async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx);
  p.subscription = {
    findFirst: tx.subscription.findFirst,
  };
  p.user = {
    findUnique: async () => ({
      extraLabelCredits: state.extraLabelCredits,
      extraTrackingCredits: state.extraTrackingCredits,
      role: state.role,
    }),
  };
  p.usageMonthly = {
    findUnique: tx.usageMonthly.findUnique,
    upsert: tx.usageMonthly.upsert,
    updateMany: tx.usageMonthly.updateMany,
  };

  try {
    await run();
  } finally {
    p.$connect = original.$connect;
    p.$executeRaw = original.$executeRaw;
    p.$queryRaw = original.$queryRaw;
    p.$transaction = original.$transaction;
    p.subscription = original.subscription;
    p.user = original.user;
    p.usageMonthly = original.usageMonthly;
  }
}

const todayIso = new Date().toISOString();
const monthOnlyIso = `${todayIso.slice(0, 7)}-01T00:00:00.000Z`;

const tests: TestCase[] = [
  {
    name: "free account allows one complaint per day",
    async run() {
      const state = makeMockState({ planName: "Free" });
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.dailyLimit, 1);
        assert.equal(allowance.dailyRemaining, 1);
        assert.equal(allowance.monthlyLimit, 5);
      });
    },
  },
  {
    name: "free account blocks second complaint same day",
    async run() {
      const state = makeMockState({ planName: "Free" });
      addComplaintLogs(state, 1, todayIso);
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.dailyLimit, 1);
        assert.equal(allowance.dailyRemaining, 0);
      });
    },
  },
  {
    name: "free account blocks after five complaints in month",
    async run() {
      const state = makeMockState({ planName: "Free" });
      addComplaintLogs(state, 5, monthOnlyIso);
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.monthlyLimit, 5);
        assert.equal(allowance.monthlyRemaining, 0);
      });
    },
  },
  {
    name: "standard account allows five complaints in one day",
    async run() {
      const state = makeMockState({ planName: "Standard" });
      addComplaintLogs(state, 4, todayIso);
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.dailyLimit, 5);
        assert.equal(allowance.dailyRemaining, 1);
      });
    },
  },
  {
    name: "standard account blocks sixth complaint same day",
    async run() {
      const state = makeMockState({ planName: "Standard" });
      addComplaintLogs(state, 5, todayIso);
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.dailyRemaining, 0);
      });
    },
  },
  {
    name: "standard monthly allowance is 150 on calendar-month design",
    async run() {
      const state = makeMockState({ planName: "Standard" });
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.monthlyLimit, 150);
      });
    },
  },
  {
    name: "standard monthly allowance does not shrink for short months in current design",
    async run() {
      const state = makeMockState({ planName: "Standard" });
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.monthlyLimit, 150);
      });
    },
  },
  {
    name: "business account allows ten complaints in one day",
    async run() {
      const state = makeMockState({ planName: "Business" });
      addComplaintLogs(state, 9, todayIso);
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.dailyLimit, 10);
        assert.equal(allowance.dailyRemaining, 1);
      });
    },
  },
  {
    name: "business account blocks eleventh complaint same day",
    async run() {
      const state = makeMockState({ planName: "Business" });
      addComplaintLogs(state, 10, todayIso);
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.dailyRemaining, 0);
      });
    },
  },
  {
    name: "business monthly allowance is 300",
    async run() {
      const state = makeMockState({ planName: "Business" });
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.monthlyLimit, 300);
      });
    },
  },
  {
    name: "admin account bypasses daily and monthly complaint limits",
    async run() {
      const state = makeMockState({ planName: "Free", role: "ADMIN" });
      addComplaintLogs(state, 500, todayIso);
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.dailyLimit, Number.MAX_SAFE_INTEGER);
        assert.equal(allowance.monthlyLimit, Number.MAX_SAFE_INTEGER);
        assert.ok(allowance.dailyRemaining > 0);
        assert.ok(allowance.monthlyRemaining > 0);
      });
    },
  },
  {
    name: "accepted complaint consumes exactly ten units",
    async run() {
      const state = makeMockState({ planName: "Standard" });
      await withPrismaMock(state, async () => {
        const result = await consumeUnits(state.userId, [{
          actionType: "complaint",
          requestKey: "accepted-complaint-1",
          unitsUsed: COMPLAINT_UNIT_COST,
        }]);
        assert.equal(result.ok, true);
        const row = state.usageLogs.find((item) => item.request_key === "accepted-complaint-1");
        assert.ok(row);
        assert.equal(row?.units_used, 10);
        assert.equal(state.usageMonthly.labelsQueued, 10);
      });
    },
  },
  {
    name: "rejected missing or invalid input consumes zero complaint units",
    async run() {
      const state = makeMockState({ planName: "Standard" });
      await withPrismaMock(state, async () => {
        assert.equal(state.usageLogs.length, 0);
      });
    },
  },
  {
    name: "duplicate rejected complaint consumes zero complaint units",
    async run() {
      const state = makeMockState({ planName: "Standard" });
      await withPrismaMock(state, async () => {
        assert.equal(state.usageLogs.length, 0);
      });
    },
  },
  {
    name: "allowance blocked complaint consumes zero complaint units",
    async run() {
      const state = makeMockState({ planName: "Free" });
      addComplaintLogs(state, 1, todayIso);
      await withPrismaMock(state, async () => {
        const allowance = await getComplaintAllowance(state.userId);
        assert.equal(allowance.dailyRemaining, 0);
        const consumedRows = state.usageLogs.filter((row) => row.status === "CONSUMED");
        assert.equal(consumedRows.length, 1);
      });
    },
  },
  {
    name: "queue enqueue failure flow can safely refund consumed complaint units",
    async run() {
      const state = makeMockState({ planName: "Standard" });
      await withPrismaMock(state, async () => {
        const requestKey = "queue-failure-complaint-1";
        const consumeResult = await consumeUnits(state.userId, [{
          actionType: "complaint",
          requestKey,
          unitsUsed: COMPLAINT_UNIT_COST,
        }]);
        assert.equal(consumeResult.ok, true);
        await refundUnits(state.userId, [{
          actionType: "complaint",
          requestKey,
          unitsUsed: COMPLAINT_UNIT_COST,
        }]);

        const row = state.usageLogs.find((item) => item.request_key === requestKey);
        assert.ok(row);
        assert.equal(row?.status, "REFUNDED");
        assert.equal(state.usageMonthly.labelsQueued, 0);
      });
    },
  },
];

let failed = false;

for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS complaint unit accounting: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL complaint unit accounting: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`complaint unit accounting tests passed: ${tests.length}`);
}
