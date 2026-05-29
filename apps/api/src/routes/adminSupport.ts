import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/auth.js";
import {
  getSupportDeleteAfter,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  isOverdueTicket,
  toSupportPriority,
  toSupportStatus,
} from "../services/supportTickets.js";
import {
  createSupportNotification,
  listAdminSupportNotifications,
  markAdminSupportNotificationsRead,
} from "../services/supportNotifications.js";

export const adminSupportRouter = Router();

adminSupportRouter.use(requireAuth, requireAdmin);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
  userId: z.string().optional(),
  search: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const statusPatchSchema = z.object({
  status: z.string().min(2).max(40),
});

const priorityPatchSchema = z.object({
  priority: z.string().min(2).max(40),
});

const messageSchema = z.object({
  message: z.string().min(1).max(5000),
});

const preservePatchSchema = z.object({
  isPreserved: z.boolean(),
});

const notificationReadSchema = z.object({
  notificationIds: z.array(z.string().min(1)).max(200).optional(),
  markAll: z.boolean().optional(),
});

async function writeAuditLog(input: {
  ticketId: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  metadataJson?: Record<string, unknown> | null;
}) {
  await prisma.supportTicketAuditLog.create({
    data: {
      ticketId: input.ticketId,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      action: input.action,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      metadataJson: input.metadataJson ? (input.metadataJson as Prisma.InputJsonValue) : undefined,
    },
  });
}

adminSupportRouter.get("/tickets", async (req: AuthedRequest, res) => {
  try {
    const query = listQuerySchema.parse(req.query);

    const fromDate = query.from ? new Date(`${query.from}T00:00:00.000Z`) : null;
    const toDate = query.to ? new Date(`${query.to}T23:59:59.999Z`) : null;

    const where: Record<string, unknown> = {
      ...(query.status ? { status: String(query.status).trim().toUpperCase() } : {}),
      ...(query.priority ? { priority: String(query.priority).trim().toUpperCase() } : {}),
      ...(query.category ? { category: String(query.category).trim().toUpperCase() } : {}),
      ...(query.userId ? { userId: String(query.userId).trim() } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    if (query.search) {
      const q = String(query.search).trim();
      (where as any).OR = [
        { ticketNumber: { contains: q, mode: "insensitive" } },
        { subject: { contains: q, mode: "insensitive" } },
        { initialMessage: { contains: q, mode: "insensitive" } },
        {
          user: {
            email: { contains: q, mode: "insensitive" },
          },
        },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              companyName: true,
            },
          },
          _count: {
            select: {
              messages: true,
              attachments: true,
            },
          },
        },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return res.json({
      tickets,
      page: query.page,
      pageSize: query.pageSize,
      total,
      filters: {
        statuses: [...SUPPORT_TICKET_STATUSES],
        priorities: [...SUPPORT_TICKET_PRIORITIES],
        categories: [...SUPPORT_TICKET_CATEGORIES],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to list support tickets" });
  }
});

adminSupportRouter.get("/summary", async (_req, res) => {
  try {
    const now = new Date();
    const [
      openTickets,
      pendingTickets,
      resolvedTickets,
      overdueRows,
      totalSupportTickets,
      closedTickets,
      totalSupportAttachments,
      attachmentAggregate,
    ] = await Promise.all([
      prisma.supportTicket.count({
        where: { status: "OPEN" },
      }),
      prisma.supportTicket.count({
        where: { status: "PENDING" },
      }),
      prisma.supportTicket.count({
        where: { status: "RESOLVED" },
      }),
      prisma.supportTicket.findMany({
        where: {
          firstResponseDueAt: { not: null },
        },
        select: {
          status: true,
          firstResponseDueAt: true,
        },
      }),
      prisma.supportTicket.count(),
      prisma.supportTicket.count({ where: { status: "CLOSED" } }),
      prisma.supportTicketAttachment.count(),
      prisma.supportTicketAttachment.aggregate({ _sum: { sizeBytes: true } }),
    ]);

    const overdueTickets = overdueRows.filter((row) => isOverdueTicket(row.status, row.firstResponseDueAt, now)).length;
    const totalStorageBytes = Number(attachmentAggregate._sum.sizeBytes ?? 0);

    return res.json({
      openTickets,
      pendingTickets,
      resolvedTickets,
      overdueTickets,
      totalSupportTickets,
      closedTickets,
      totalSupportAttachments,
      totalSupportStorageMb: Math.round((totalStorageBytes / (1024 * 1024)) * 100) / 100,
    });
  } catch {
    return res.status(500).json({ error: "Failed to load support summary" });
  }
});

adminSupportRouter.get("/tickets/:id", async (req, res) => {
  try {
    const ticketId = String(req.params.id ?? "").trim();
    if (!ticketId) {
      return res.status(400).json({ error: "Ticket id is required" });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            companyName: true,
            contactNumber: true,
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            attachments: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                messageId: true,
                originalName: true,
                safeFileName: true,
                mimeType: true,
                sizeBytes: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found" });
    }

    return res.json({ ticket });
  } catch {
    return res.status(500).json({ error: "Failed to load support ticket" });
  }
});

adminSupportRouter.patch("/tickets/:id/status", async (req: AuthedRequest, res) => {
  try {
    const actorUserId = String(req.user?.id ?? "").trim();
    const ticketId = String(req.params.id ?? "").trim();
    const body = statusPatchSchema.parse(req.body);
    const status = toSupportStatus(body.status);
    if (!status) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        status: true,
        isPreserved: true,
        ticketNumber: true,
        subject: true,
        userId: true,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found" });
    }

    const now = new Date();

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        ...(status === "RESOLVED" ? { resolvedAt: now } : {}),
        ...(status === "CLOSED"
          ? {
              closedAt: now,
              deleteAfter: ticket.isPreserved ? null : getSupportDeleteAfter(now),
            }
          : {
              deleteAfter: null,
              ...(ticket.status === "CLOSED" ? { closedAt: null } : {}),
            }),
      },
    });

    await writeAuditLog({
      ticketId,
      actorUserId,
      actorRole: req.user?.role ?? "ADMIN",
      action: "status_changed",
      fromValue: ticket.status,
      toValue: status,
    });

    await createSupportNotification({
      userId: ticket.userId,
      ticketId,
      type: "CUSTOMER_STATUS_CHANGED",
      title: status === "CLOSED" ? `Ticket ${ticket.ticketNumber} closed` : status === "RESOLVED" ? `Ticket ${ticket.ticketNumber} resolved` : `Ticket ${ticket.ticketNumber} updated`,
      message: `${ticket.subject} is now ${status}.`,
    });

    return res.json({ ticket: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to update ticket status" });
  }
});

adminSupportRouter.patch("/tickets/:id/preserve", async (req: AuthedRequest, res) => {
  try {
    const actorUserId = String(req.user?.id ?? "").trim();
    const ticketId = String(req.params.id ?? "").trim();
    const body = preservePatchSchema.parse(req.body);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, isPreserved: true },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found" });
    }

    const isClosed = String(ticket.status).toUpperCase() === "CLOSED";
    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        isPreserved: body.isPreserved,
        deleteAfter: body.isPreserved ? null : (isClosed ? getSupportDeleteAfter(new Date()) : null),
      },
    });

    await writeAuditLog({
      ticketId,
      actorUserId,
      actorRole: req.user?.role ?? "ADMIN",
      action: "preserve_toggled",
      fromValue: String(ticket.isPreserved),
      toValue: String(body.isPreserved),
      metadataJson: {
        status: ticket.status,
        deleteAfter: updated.deleteAfter?.toISOString() ?? null,
      },
    });

    return res.json({ ticket: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to update preserve state" });
  }
});

adminSupportRouter.patch("/tickets/:id/priority", async (req: AuthedRequest, res) => {
  try {
    const actorUserId = String(req.user?.id ?? "").trim();
    const ticketId = String(req.params.id ?? "").trim();
    const body = priorityPatchSchema.parse(req.body);
    const priority = toSupportPriority(body.priority);
    if (!priority) {
      return res.status(400).json({ error: "Invalid priority" });
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        priority: true,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found" });
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { priority },
    });

    await writeAuditLog({
      ticketId,
      actorUserId,
      actorRole: req.user?.role ?? "ADMIN",
      action: "priority_changed",
      fromValue: ticket.priority,
      toValue: priority,
    });

    return res.json({ ticket: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to update ticket priority" });
  }
});

adminSupportRouter.post("/tickets/:id/messages", async (req: AuthedRequest, res) => {
  try {
    const actorUserId = String(req.user?.id ?? "").trim();
    const ticketId = String(req.params.id ?? "").trim();
    const body = messageSchema.parse(req.body);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, userId: true, ticketNumber: true, subject: true },
    });

    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found" });
    }

    const now = new Date();
    const message = await prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorUserId: actorUserId,
        authorRole: req.user?.role ?? "ADMIN",
        message: body.message.trim(),
      },
    });

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: "WAITING_CUSTOMER",
        lastReplyAt: now,
      },
    });

    await writeAuditLog({
      ticketId,
      actorUserId,
      actorRole: req.user?.role ?? "ADMIN",
      action: "admin_reply",
      metadataJson: { messageId: message.id },
    });

    await createSupportNotification({
      userId: ticket.userId,
      ticketId,
      type: "CUSTOMER_ADMIN_REPLY",
      title: `New admin reply on ${ticket.ticketNumber}`,
      message: body.message.trim().slice(0, 160),
    });

    return res.status(201).json({ message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to post admin reply" });
  }
});

adminSupportRouter.get("/notifications", async (req: AuthedRequest, res) => {
  try {
    const actorUserId = String(req.user?.id ?? "").trim();
    if (!actorUserId) return res.status(401).json({ error: "Unauthorized" });
    const result = await listAdminSupportNotifications(actorUserId);
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Failed to load admin support notifications" });
  }
});

adminSupportRouter.post("/notifications/read", async (req: AuthedRequest, res) => {
  try {
    const actorUserId = String(req.user?.id ?? "").trim();
    if (!actorUserId) return res.status(401).json({ error: "Unauthorized" });
    const body = notificationReadSchema.parse(req.body ?? {});
    if (!body.markAll && (!body.notificationIds || body.notificationIds.length === 0)) {
      return res.status(400).json({ error: "notificationIds or markAll is required" });
    }
    const updatedCount = await markAdminSupportNotificationsRead(actorUserId, body.notificationIds, body.markAll);
    return res.json({ updatedCount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to update admin support notifications" });
  }
});
