import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { supportRouter } from "./support.js";
import { adminSupportRouter } from "./adminSupport.js";
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  getSupportDeleteAfter,
  isAllowedAttachment,
} from "../services/supportTickets.js";

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
  isPreserved?: boolean;
  deleteAfter?: Date | null;
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

type NotificationRow = {
  id: string;
  userId?: string | null;
  ticketId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
};

type State = {
  idSeq: number;
  tickets: TicketRow[];
  messages: MessageRow[];
  audits: AuditRow[];
  notifications: NotificationRow[];
  attachmentCount: number;
  attachmentBytes: number;
};

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const createTicketHandler = getRouteHandler(supportRouter, "post", "/tickets");
const listOwnTicketsHandler = getRouteHandler(supportRouter, "get", "/tickets");
const getOwnTicketHandler = getRouteHandler(supportRouter, "get", "/tickets/:id");
const replyOwnTicketHandler = getRouteHandler(supportRouter, "post", "/tickets/:id/messages");
const listSupportNotificationsHandler = getRouteHandler(supportRouter, "get", "/notifications");
const markSupportNotificationsReadHandler = getRouteHandler(supportRouter, "post", "/notifications/read");

const adminListTicketsHandler = getRouteHandler(adminSupportRouter, "get", "/tickets");
const adminSummaryHandler = getRouteHandler(adminSupportRouter, "get", "/summary");
const adminUpdateStatusHandler = getRouteHandler(adminSupportRouter, "patch", "/tickets/:id/status");
const adminUpdatePreserveHandler = getRouteHandler(adminSupportRouter, "patch", "/tickets/:id/preserve");
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
    notifications: [],
    attachmentCount: 0,
    attachmentBytes: 0,
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
  if (where.isPreserved !== undefined && Boolean(ticket.isPreserved) !== Boolean(where.isPreserved)) return false;
  if (where.deleteAfter?.lte && (!ticket.deleteAfter || ticket.deleteAfter.getTime() > where.deleteAfter.lte.getTime())) return false;
  if (where.priority && ticket.priority !== where.priority) return false;
  if (where.category && ticket.category !== where.category) return false;
  return true;
}

function matchNotificationWhere(notification: NotificationRow, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.OR) && where.OR.length > 0) {
    return where.OR.some((entry: any) => matchNotificationWhere(notification, entry))
      && matchNotificationWhere(notification, { ...where, OR: undefined });
  }
  if (where.userId !== undefined && notification.userId !== where.userId) return false;
  if (where.isRead !== undefined && notification.isRead !== where.isRead) return false;
  if (where.id?.in && !where.id.in.includes(notification.id)) return false;
  return true;
}

async function withSupportMocks(state: State, run: () => Promise<void>) {
  const p = prisma as any;
  const original = {
    supportTicket: p.supportTicket,
    supportTicketMessage: p.supportTicketMessage,
    supportTicketAttachment: p.supportTicketAttachment,
    supportTicketAuditLog: p.supportTicketAuditLog,
    supportTicketNotification: p.supportTicketNotification,
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
    count: async () => state.attachmentCount,
    aggregate: async () => ({ _sum: { sizeBytes: state.attachmentBytes } }),
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

  p.supportTicketNotification = {
    create: async ({ data }: any) => {
      const row: NotificationRow = {
        id: nextId(state, "notification"),
        userId: data.userId ?? null,
        ticketId: String(data.ticketId),
        type: String(data.type),
        title: String(data.title),
        message: String(data.message),
        isRead: Boolean(data.isRead ?? false),
        createdAt: new Date(),
      };
      state.notifications.push(row);
      return row;
    },
    findMany: async ({ where }: any = {}) => {
      return state.notifications
        .filter((notification) => matchNotificationWhere(notification, where))
        .map((notification) => {
          const ticket = state.tickets.find((row) => row.id === notification.ticketId);
          return {
            ...notification,
            ticket: ticket
              ? {
                  id: ticket.id,
                  ticketNumber: ticket.ticketNumber,
                  subject: ticket.subject,
                  status: ticket.status,
                  priority: ticket.priority,
                }
              : null,
          };
        });
    },
    count: async ({ where }: any = {}) => state.notifications.filter((notification) => matchNotificationWhere(notification, where)).length,
    updateMany: async ({ where, data }: any = {}) => {
      let count = 0;
      for (const notification of state.notifications) {
        if (!matchNotificationWhere(notification, where)) continue;
        Object.assign(notification, data);
        count += 1;
      }
      return { count };
    },
  };

  try {
    await run();
  } finally {
    p.supportTicket = original.supportTicket;
    p.supportTicketMessage = original.supportTicketMessage;
    p.supportTicketAttachment = original.supportTicketAttachment;
    p.supportTicketAuditLog = original.supportTicketAuditLog;
    p.supportTicketNotification = original.supportTicketNotification;
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
      assert.equal(state.notifications.some((row) => row.type === "ADMIN_NEW_TICKET" || row.type === "ADMIN_HIGH_PRIORITY_OPEN_TICKET"), true);
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
    name: "customer cannot reply to CLOSED ticket",
    async run() {
      const state = makeState();
      state.tickets.push({
        id: "ticket-closed",
        ticketNumber: "SUP-CLOSED",
        userId: "user-a",
        subject: "Closed ticket",
        category: "TECHNICAL",
        priority: "LOW",
        status: "CLOSED",
        initialMessage: "x",
        firstResponseDueAt: null,
        lastReplyAt: null,
        resolvedAt: null,
        closedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = makeReq("user-a", "USER", { message: "Can I still reply?" }, {}, { id: "ticket-closed" });
      const { res, state: response } = makeRes();

      await withSupportMocks(state, async () => {
        await replyOwnTicketHandler(req as any, res as any);
      });

      assert.equal(response.statusCode, 409);
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
      assert.equal(state.notifications.some((row) => row.type === "CUSTOMER_STATUS_CHANGED" && row.userId === "user-a"), true);
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
    name: "attachment max file count and size constants are enforced",
    async run() {
      assert.equal(SUPPORT_ATTACHMENT_MAX_FILES, 5);
      assert.equal(SUPPORT_ATTACHMENT_MAX_BYTES, 10 * 1024 * 1024);
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
      assert.equal(state.notifications.some((row) => row.type === "CUSTOMER_STATUS_CHANGED"), true);
      assert.equal(state.notifications.some((row) => row.type === "CUSTOMER_ADMIN_REPLY"), true);
    },
  },
  {
    name: "admin summary includes support storage metrics",
    async run() {
      const state = makeState();
      state.attachmentCount = 4;
      state.attachmentBytes = 6 * 1024 * 1024;
      state.tickets.push(
        {
          id: "ticket-open",
          ticketNumber: "SUP-OPEN",
          userId: "user-a",
          subject: "Open ticket",
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
        },
        {
          id: "ticket-closed",
          ticketNumber: "SUP-CLOSED",
          userId: "user-b",
          subject: "Closed ticket",
          category: "TECHNICAL",
          priority: "MEDIUM",
          status: "CLOSED",
          initialMessage: "y",
          firstResponseDueAt: null,
          lastReplyAt: null,
          resolvedAt: null,
          closedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      );

      await withSupportMocks(state, async () => {
        const req = makeReq("admin-1", "ADMIN");
        const { res, state: response } = makeRes();
        await adminSummaryHandler(req as any, res as any);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.totalSupportTickets, 2);
        assert.equal(response.body.closedTickets, 1);
        assert.equal(response.body.totalSupportAttachments, 4);
        assert.equal(response.body.totalSupportStorageMb, 6);
      });
    },
  },
  {
    name: "admin can toggle preserve on closed ticket and schedule deleteAfter when unpreserved",
    async run() {
      const state = makeState();
      state.tickets.push({
        id: "ticket-retention",
        ticketNumber: "SUP-RET",
        userId: "user-a",
        subject: "Retention",
        category: "TECHNICAL",
        priority: "MEDIUM",
        status: "CLOSED",
        initialMessage: "x",
        firstResponseDueAt: null,
        lastReplyAt: null,
        resolvedAt: null,
        closedAt: new Date(),
        isPreserved: false,
        deleteAfter: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await withSupportMocks(state, async () => {
        const preserveReq = makeReq("admin-1", "ADMIN", { isPreserved: true }, {}, { id: "ticket-retention" });
        const preserveRes = makeRes();
        await adminUpdatePreserveHandler(preserveReq as any, preserveRes.res as any);
        assert.equal(preserveRes.state.statusCode, 200);
        assert.equal(state.tickets[0].isPreserved, true);
        assert.equal(state.tickets[0].deleteAfter, null);

        const unpreserveReq = makeReq("admin-1", "ADMIN", { isPreserved: false }, {}, { id: "ticket-retention" });
        const unpreserveRes = makeRes();
        await adminUpdatePreserveHandler(unpreserveReq as any, unpreserveRes.res as any);
        assert.equal(unpreserveRes.state.statusCode, 200);
        assert.equal(state.tickets[0].isPreserved, false);
        assert.equal(Boolean(state.tickets[0].deleteAfter), true);

        const closeReq = makeReq("admin-1", "ADMIN", { status: "CLOSED" }, {}, { id: "ticket-retention" });
        const closeRes = makeRes();
        await adminUpdateStatusHandler(closeReq as any, closeRes.res as any);
        assert.equal(closeRes.state.statusCode, 200);

        const expected = getSupportDeleteAfter(new Date());
        const scheduled = state.tickets[0].deleteAfter as Date | null | undefined;
        assert.equal(scheduled instanceof Date, true);
        assert.equal(Math.abs((scheduled instanceof Date ? scheduled.getTime() : 0) - expected.getTime()) < 10 * 1000, true);
      });
    },
  },
  {
    name: "mark notification read endpoint updates unread count",
    async run() {
      const state = makeState();
      state.notifications.push({
        id: "notification-1",
        userId: "user-a",
        ticketId: "ticket-own",
        type: "CUSTOMER_ADMIN_REPLY",
        title: "New admin reply",
        message: "Please check the latest update.",
        isRead: false,
        createdAt: new Date(),
      });

      await withSupportMocks(state, async () => {
        const listReq = makeReq("user-a", "USER");
        const listRes = makeRes();
        await listSupportNotificationsHandler(listReq as any, listRes.res as any);
        assert.equal(listRes.state.statusCode, 200);
        assert.equal(listRes.state.body.unreadCount, 1);

        const markReq = makeReq("user-a", "USER", { notificationIds: ["notification-1"] });
        const markRes = makeRes();
        await markSupportNotificationsReadHandler(markReq as any, markRes.res as any);
        assert.equal(markRes.state.statusCode, 200);

        const listAfterReq = makeReq("user-a", "USER");
        const listAfterRes = makeRes();
        await listSupportNotificationsHandler(listAfterReq as any, listAfterRes.res as any);
        assert.equal(listAfterRes.state.body.unreadCount, 0);
      });
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
