import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { supportRouter } from "./support.js";
import { adminSupportRouter } from "./adminSupport.js";
import { isAllowedAttachment } from "../services/supportTickets.js";

type Role = "USER" | "ADMIN";

type TicketRow = {
  id: string;
  ticketNumber: string;
  userId: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  initialMessage: string;
  firstResponseDueAt: Date | null;
  lastReplyAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MessageRow = {
  id: string;
  ticketId: string;
  authorUserId: string;
  authorRole: string;
  message: string;
  createdAt: Date;
};

type AuditRow = {
  ticketId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  metadataJson?: Record<string, unknown>;
};

type State = {
  idSeq: number;
  tickets: TicketRow[];
  messages: MessageRow[];
  audits: AuditRow[];
};

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const createTicketHandler = getRouteHandler(supportRouter, "post", "/tickets");
const listOwnTicketsHandler = getRouteHandler(supportRouter, "get", "/tickets");
const getOwnTicketHandler = getRouteHandler(supportRouter, "get", "/tickets/:id");

const adminListTicketsHandler = getRouteHandler(adminSupportRouter, "get", "/tickets");
const adminUpdateStatusHandler = getRouteHandler(adminSupportRouter, "patch", "/tickets/:id/status");
const adminUpdatePriorityHandler = getRouteHandler(adminSupportRouter, "patch", "/tickets/:id/priority");
const adminReplyHandler = getRouteHandler(adminSupportRouter, "post", "/tickets/:id/messages");

function getRouteHandler(router: unknown, method: "get" | "post" | "patch", path: string) {
  const stack = (router as any)?.stack ?? [];
  const layer = stack.find((entry: any) => entry?.route?.path === path && entry?.route?.methods?.[method]);
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  return layer.route.stack[layer.route.stack.length - 1].handle as (req: any, res: any) => Promise<unknown>;
}

function makeState(): State {
  return {
    idSeq: 1,
    tickets: [],
    messages: [],
    audits: [],
  };
}

function nextId(state: State, prefix: string) {
  const value = `${prefix}-${state.idSeq}`;
  state.idSeq += 1;
  return value;
}

function makeReq(userId: string, role: Role, body: any = {}, query: any = {}, params: any = {}) {
  return {
    user: { id: userId, role },
    body,
    query,
    params,
  };
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

function matchWhere(ticket: TicketRow, where: any) {
  if (!where) return true;
  if (where.id && ticket.id !== where.id) return false;
  if (where.userId && ticket.userId !== where.userId) return false;
  if (where.status && ticket.status !== where.status) return false;
  if (where.priority && ticket.priority !== where.priority) return false;
  if (where.category && ticket.category !== where.category) return false;
  return true;
}

async function withSupportMocks(state: State, run: () => Promise<void>) {
  const p = prisma as any;
  const original = {
    supportTicket: p.supportTicket,
    supportTicketMessage: p.supportTicketMessage,
    supportTicketAttachment: p.supportTicketAttachment,
    supportTicketAuditLog: p.supportTicketAuditLog,
  };

  p.supportTicket = {
    create: async ({ data }: any) => {
      const now = new Date();
      const ticketId = nextId(state, "ticket");
      const row: TicketRow = {
        id: ticketId,
        ticketNumber: String(data.ticketNumber ?? "SUP-TEST"),
        userId: String(data.userId),
        subject: String(data.subject),
        category: String(data.category),
        priority: String(data.priority),
        status: String(data.status ?? "OPEN"),
        initialMessage: String(data.initialMessage ?? ""),
        firstResponseDueAt: data.firstResponseDueAt ?? null,
        lastReplyAt: data.lastReplyAt ?? null,
        resolvedAt: null,
        closedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      state.tickets.push(row);

      if (data.messages?.create) {
        state.messages.push({
          id: nextId(state, "msg"),
          ticketId,
          authorUserId: String(data.messages.create.authorUserId),
          authorRole: String(data.messages.create.authorRole),
          message: String(data.messages.create.message),
          createdAt: now,
        });
      }

      return {
        ...row,
        messages: state.messages.filter((msg) => msg.ticketId === ticketId).map((msg) => ({ ...msg, attachments: [] })),
      };
    },
    findMany: async ({ where }: any = {}) => {
      const rows = state.tickets.filter((ticket) => matchWhere(ticket, where));
      return rows.map((ticket) => ({
        ...ticket,
        user: { id: ticket.userId, email: `${ticket.userId}@example.com`, companyName: null },
        _count: {
          messages: state.messages.filter((msg) => msg.ticketId === ticket.id).length,
          attachments: 0,
        },
      }));
    },
    count: async ({ where }: any = {}) => state.tickets.filter((ticket) => matchWhere(ticket, where)).length,
    findFirst: async ({ where, include, select }: any = {}) => {
      const found = state.tickets.find((ticket) => matchWhere(ticket, where));
      if (!found) return null;
      if (select) {
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          selected[key] = (found as any)[key];
        }
        return selected;
      }
      if (include?.messages) {
        return {
          ...found,
          messages: state.messages
            .filter((msg) => msg.ticketId === found.id)
            .map((msg) => ({ ...msg, attachments: [] })),
        };
      }
      return found;
    },
    findUnique: async ({ where, select }: any = {}) => {
      const found = state.tickets.find((ticket) => ticket.id === where.id) ?? null;
      if (!found) return null;
      if (select) {
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          selected[key] = (found as any)[key];
        }
        return selected;
      }
      return found;
    },
    update: async ({ where, data }: any) => {
      const found = state.tickets.find((ticket) => ticket.id === where.id);
      if (!found) throw new Error("ticket not found");
      Object.assign(found, data, { updatedAt: new Date() });
      return { ...found };
    },
  };

  p.supportTicketMessage = {
    create: async ({ data }: any) => {
      const msg: MessageRow = {
        id: nextId(state, "msg"),
        ticketId: String(data.ticketId),
        authorUserId: String(data.authorUserId),
        authorRole: String(data.authorRole),
        message: String(data.message),
        createdAt: new Date(),
      };
      state.messages.push(msg);
      return msg;
    },
  };

  p.supportTicketAttachment = {
    findFirst: async () => null,
    create: async () => ({ id: nextId(state, "att") }),
  };

  p.supportTicketAuditLog = {
    create: async ({ data }: any) => {
      state.audits.push({
        ticketId: String(data.ticketId),
        actorUserId: String(data.actorUserId),
        actorRole: String(data.actorRole),
        action: String(data.action),
        fromValue: data.fromValue ?? null,
        toValue: data.toValue ?? null,
        metadataJson: data.metadataJson ?? undefined,
      });
      return { id: nextId(state, "audit"), ...data };
    },
  };

  try {
    await run();
  } finally {
    p.supportTicket = original.supportTicket;
    p.supportTicketMessage = original.supportTicketMessage;
    p.supportTicketAttachment = original.supportTicketAttachment;
    p.supportTicketAuditLog = original.supportTicketAuditLog;
  }
}

const tests: TestCase[] = [
  {
    name: "customer creates support ticket",
    async run() {
      const state = makeState();
      const req = makeReq("user-a", "USER", {
        subject: "Need billing help",
        category: "BILLING",
        priority: "HIGH",
        message: "Please check my last invoice",
      });
      const { res, state: response } = makeRes();

      await withSupportMocks(state, async () => {
        await createTicketHandler(req as any, res as any);
      });

      assert.equal(response.statusCode, 201);
      assert.equal(state.tickets.length, 1);
      assert.equal(state.tickets[0].userId, "user-a");
      assert.equal(state.audits.some((row) => row.action === "ticket_created"), true);
    },
  },
  {
    name: "customer lists only own tickets",
    async run() {
      const state = makeState();
      state.tickets.push(
        {
          id: "ticket-own",
          ticketNumber: "SUP-OWN",
          userId: "user-a",
          subject: "Own ticket",
          category: "TECHNICAL",
          priority: "MEDIUM",
          status: "OPEN",
          initialMessage: "x",
          firstResponseDueAt: null,
          lastReplyAt: null,
          resolvedAt: null,
          closedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "ticket-other",
          ticketNumber: "SUP-OTHER",
          userId: "user-b",
          subject: "Other ticket",
          category: "ACCOUNT",
          priority: "LOW",
          status: "OPEN",
          initialMessage: "y",
          firstResponseDueAt: null,
          lastReplyAt: null,
          resolvedAt: null,
          closedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );

      const req = makeReq("user-a", "USER", {}, { page: 1, pageSize: 20 });
      const { res, state: response } = makeRes();

      await withSupportMocks(state, async () => {
        await listOwnTicketsHandler(req as any, res as any);
      });

      assert.equal(response.statusCode, 200);
      assert.equal(Array.isArray(response.body?.tickets), true);
      assert.equal(response.body.tickets.length, 1);
      assert.equal(response.body.tickets[0].id, "ticket-own");
    },
  },
  {
    name: "customer cannot access another user ticket",
    async run() {
      const state = makeState();
      state.tickets.push({
        id: "ticket-private",
        ticketNumber: "SUP-PRIVATE",
        userId: "user-b",
        subject: "Other user private ticket",
        category: "TECHNICAL",
        priority: "HIGH",
        status: "OPEN",
        initialMessage: "nope",
        firstResponseDueAt: null,
        lastReplyAt: null,
        resolvedAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = makeReq("user-a", "USER", {}, {}, { id: "ticket-private" });
      const { res, state: response } = makeRes();

      await withSupportMocks(state, async () => {
        await getOwnTicketHandler(req as any, res as any);
      });

      assert.equal(response.statusCode, 404);
    },
  },
  {
    name: "admin can list tickets",
    async run() {
      const state = makeState();
      state.tickets.push(
        {
          id: "ticket-1",
          ticketNumber: "SUP-1",
          userId: "user-a",
          subject: "A",
          category: "BILLING",
          priority: "LOW",
          status: "OPEN",
          initialMessage: "A",
          firstResponseDueAt: null,
          lastReplyAt: null,
          resolvedAt: null,
          closedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "ticket-2",
          ticketNumber: "SUP-2",
          userId: "user-b",
          subject: "B",
          category: "ACCOUNT",
          priority: "MEDIUM",
          status: "PENDING",
          initialMessage: "B",
          firstResponseDueAt: null,
          lastReplyAt: null,
          resolvedAt: null,
          closedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );
      const req = makeReq("admin-1", "ADMIN", {}, { page: 1, pageSize: 20 });
      const { res, state: response } = makeRes();

      await withSupportMocks(state, async () => {
        await adminListTicketsHandler(req as any, res as any);
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.tickets.length, 2);
    },
  },
  {
    name: "admin can update status",
    async run() {
      const state = makeState();
      state.tickets.push({
        id: "ticket-status",
        ticketNumber: "SUP-S",
        userId: "user-a",
        subject: "Status change",
        category: "TECHNICAL",
        priority: "MEDIUM",
        status: "OPEN",
        initialMessage: "x",
        firstResponseDueAt: null,
        lastReplyAt: null,
        resolvedAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const req = makeReq("admin-1", "ADMIN", { status: "RESOLVED" }, {}, { id: "ticket-status" });
      const { res, state: response } = makeRes();

      await withSupportMocks(state, async () => {
        await adminUpdateStatusHandler(req as any, res as any);
      });

      assert.equal(response.statusCode, 200);
      assert.equal(state.tickets[0].status, "RESOLVED");
      assert.equal(state.audits.some((row) => row.action === "status_changed"), true);
    },
  },
  {
    name: "admin can update priority",
    async run() {
      const state = makeState();
      state.tickets.push({
        id: "ticket-priority",
        ticketNumber: "SUP-P",
        userId: "user-a",
        subject: "Priority change",
        category: "TECHNICAL",
        priority: "MEDIUM",
        status: "OPEN",
        initialMessage: "x",
        firstResponseDueAt: null,
        lastReplyAt: null,
        resolvedAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const req = makeReq("admin-1", "ADMIN", { priority: "URGENT" }, {}, { id: "ticket-priority" });
      const { res, state: response } = makeRes();

      await withSupportMocks(state, async () => {
        await adminUpdatePriorityHandler(req as any, res as any);
      });

      assert.equal(response.statusCode, 200);
      assert.equal(state.tickets[0].priority, "URGENT");
      assert.equal(state.audits.some((row) => row.action === "priority_changed"), true);
    },
  },
  {
    name: "attachment rejects blocked file type",
    async run() {
      const blocked = isAllowedAttachment("malware.exe", "application/x-msdownload");
      assert.equal(blocked.ok, false);
    },
  },
  {
    name: "audit log created for status priority and admin reply",
    async run() {
      const state = makeState();
      state.tickets.push({
        id: "ticket-audit",
        ticketNumber: "SUP-AUDIT",
        userId: "user-a",
        subject: "Audit verification",
        category: "ACCOUNT",
        priority: "LOW",
        status: "OPEN",
        initialMessage: "x",
        firstResponseDueAt: null,
        lastReplyAt: null,
        resolvedAt: null,
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await withSupportMocks(state, async () => {
        const statusReq = makeReq("admin-1", "ADMIN", { status: "IN_PROGRESS" }, {}, { id: "ticket-audit" });
        const statusRes = makeRes();
        await adminUpdateStatusHandler(statusReq as any, statusRes.res as any);
        assert.equal(statusRes.state.statusCode, 200);

        const priorityReq = makeReq("admin-1", "ADMIN", { priority: "HIGH" }, {}, { id: "ticket-audit" });
        const priorityRes = makeRes();
        await adminUpdatePriorityHandler(priorityReq as any, priorityRes.res as any);
        assert.equal(priorityRes.state.statusCode, 200);

        const replyReq = makeReq("admin-1", "ADMIN", { message: "We are reviewing this." }, {}, { id: "ticket-audit" });
        const replyRes = makeRes();
        await adminReplyHandler(replyReq as any, replyRes.res as any);
        assert.equal(replyRes.state.statusCode, 201);
      });

      const actions = state.audits.map((row) => row.action);
      assert.equal(actions.includes("status_changed"), true);
      assert.equal(actions.includes("priority_changed"), true);
      assert.equal(actions.includes("admin_reply"), true);
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS support routes: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL support routes: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`support route tests passed: ${tests.length}`);
}
