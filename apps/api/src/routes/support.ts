import { Router } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getDualProviders } from "../storage/provider.js";
import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  generateSupportTicketNumber,
  getFirstResponseDueAt,
  isAllowedAttachment,
  sanitizeAttachmentFileName,
  splitSupportObjectKey,
  toR2SupportArtifactKey,
  toSupportCategory,
  toSupportPriority,
} from "../services/supportTickets.js";
import {
  createSupportNotification,
  listSupportNotifications,
  markSupportNotificationsRead,
} from "../services/supportNotifications.js";

export const supportRouter = Router();

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: SUPPORT_ATTACHMENT_MAX_BYTES,
    files: SUPPORT_ATTACHMENT_MAX_FILES,
  },
});

const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  category: z.string().min(3).max(30),
  priority: z.string().min(2).max(20).optional(),
  message: z.string().min(3).max(5000),
});

const addMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});

const ticketListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
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

async function getOwnedTicket(ticketId: string, userId: string) {
  return prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    select: {
      id: true,
      userId: true,
      ticketNumber: true,
      subject: true,
      status: true,
      priority: true,
    },
  });
}

supportRouter.post("/tickets", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = createTicketSchema.parse(req.body);
    const category = toSupportCategory(body.category);
    const priority = toSupportPriority(body.priority ?? "MEDIUM") ?? "MEDIUM";
    if (!category) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const createdAt = new Date();
    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: generateSupportTicketNumber(createdAt),
        userId,
        subject: body.subject.trim(),
        category,
        priority,
        status: "OPEN",
        initialMessage: body.message.trim(),
        firstResponseDueAt: getFirstResponseDueAt(priority, createdAt),
        lastReplyAt: createdAt,
        messages: {
          create: {
            authorUserId: userId,
            authorRole: req.user?.role ?? "USER",
            message: body.message.trim(),
          },
        },
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { attachments: true },
        },
      },
    });

    await writeAuditLog({
      ticketId: ticket.id,
      actorUserId: userId,
      actorRole: req.user?.role ?? "USER",
      action: "ticket_created",
      metadataJson: { ticketNumber: ticket.ticketNumber },
    });

    await createSupportNotification({
      userId: null,
      ticketId: ticket.id,
      type: priority === "HIGH" || priority === "URGENT" ? "ADMIN_HIGH_PRIORITY_OPEN_TICKET" : "ADMIN_NEW_TICKET",
      title: `${priority === "HIGH" || priority === "URGENT" ? "High priority" : "New"} support ticket ${ticket.ticketNumber}`,
      message: `${ticket.subject} (${priority})`,
    });

    return res.status(201).json({ ticket });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to create support ticket" });
  }
});

supportRouter.get("/tickets", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const query = ticketListQuerySchema.parse(req.query);
    const where = {
      userId,
      ...(query.status ? { status: String(query.status).trim().toUpperCase() } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          category: true,
          priority: true,
          status: true,
          firstResponseDueAt: true,
          lastReplyAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: { messages: true, attachments: true },
          },
        },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return res.json({
      tickets: items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to list support tickets" });
  }
});

supportRouter.get("/tickets/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const ticketId = String(req.params.id ?? "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!ticketId) return res.status(400).json({ error: "Ticket id is required" });

    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      include: {
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

supportRouter.post("/tickets/:id/messages", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const ticketId = String(req.params.id ?? "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = addMessageSchema.parse(req.body);
    const ticket = await getOwnedTicket(ticketId, userId);
    if (!ticket) {
      return res.status(404).json({ error: "Support ticket not found" });
    }
    if (String(ticket.status).toUpperCase() === "CLOSED") {
      return res.status(409).json({ error: "This ticket is closed. Please create a new support ticket for any further issue." });
    }

    const now = new Date();
    const message = await prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorUserId: userId,
        authorRole: req.user?.role ?? "USER",
        message: body.message.trim(),
      },
    });

    const nextStatus = ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "WAITING_CUSTOMER" : ticket.status;
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: nextStatus,
        lastReplyAt: now,
      },
    });

    await writeAuditLog({
      ticketId,
      actorUserId: userId,
      actorRole: req.user?.role ?? "USER",
      action: "user_reply",
      metadataJson: { messageId: message.id },
    });

    await createSupportNotification({
      userId: null,
      ticketId,
      type: "ADMIN_CUSTOMER_REPLY",
      title: `Customer replied to ${ticket.ticketNumber}`,
      message: body.message.trim().slice(0, 160),
    });

    return res.status(201).json({ message });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to post reply" });
  }
});

supportRouter.post("/tickets/:id/attachments", requireAuth, (req: AuthedRequest, res) => {
  attachmentUpload.array("files", SUPPORT_ATTACHMENT_MAX_FILES)(req as any, res as any, async (err: unknown) => {
    if (err) {
      return res.status(400).json({ error: "Attachment upload failed. Ensure file size and count limits are respected." });
    }

    try {
      const userId = String(req.user?.id ?? "").trim();
      const ticketId = String(req.params.id ?? "").trim();
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const ticket = await getOwnedTicket(ticketId, userId);
      if (!ticket) {
        return res.status(404).json({ error: "Support ticket not found" });
      }
      if (String(ticket.status).toUpperCase() === "CLOSED") {
        return res.status(409).json({ error: "This ticket is closed. Please create a new support ticket for any further issue." });
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        return res.status(400).json({ error: "At least one attachment is required" });
      }
      if (files.length > SUPPORT_ATTACHMENT_MAX_FILES) {
        return res.status(400).json({ error: `No more than ${SUPPORT_ATTACHMENT_MAX_FILES} attachments are allowed` });
      }

      const note = String(req.body?.message ?? "Attachment uploaded").trim() || "Attachment uploaded";
      const message = await prisma.supportTicketMessage.create({
        data: {
          ticketId,
          authorUserId: userId,
          authorRole: req.user?.role ?? "USER",
          message: note.slice(0, 5000),
        },
      });

      const r2 = getDualProviders().r2;
      const createdAt = new Date();
      const attachments = [] as Array<{
        id: string;
        messageId: string;
        originalName: string;
        safeFileName: string;
        mimeType: string;
        sizeBytes: number;
        createdAt: Date;
      }>;

      for (const file of files) {
        if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
          return res.status(400).json({ error: "Attachment exceeds maximum size of 10 MB" });
        }

        const safeFileName = sanitizeAttachmentFileName(file.originalname);
        const allowed = isAllowedAttachment(safeFileName, file.mimetype);
        if (!allowed.ok) {
          return res.status(400).json({ error: allowed.reason });
        }

        const key = toR2SupportArtifactKey(ticketId, message.id, safeFileName);
        const objectKey = await r2.writeArtifact("support-tickets", key, file.buffer);

        const createdAttachment = await prisma.supportTicketAttachment.create({
          data: {
            ticketId,
            messageId: message.id,
            uploadedByUserId: userId,
            objectKey,
            originalName: file.originalname,
            safeFileName,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            createdAt,
          },
          select: {
            id: true,
            messageId: true,
            originalName: true,
            safeFileName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        });

        attachments.push(createdAttachment);
      }

      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "WAITING_CUSTOMER" : ticket.status,
          lastReplyAt: createdAt,
        },
      });

      await writeAuditLog({
        ticketId,
        actorUserId: userId,
        actorRole: req.user?.role ?? "USER",
        action: "attachment_uploaded",
        metadataJson: { messageId: message.id, count: attachments.length },
      });

      return res.status(201).json({ messageId: message.id, attachments });
    } catch {
      return res.status(500).json({ error: "Failed to upload attachments" });
    }
  });
});

supportRouter.get("/tickets/:ticketId/attachments/:attachmentId/download", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    const ticketId = String(req.params.ticketId ?? "").trim();
    const attachmentId = String(req.params.attachmentId ?? "").trim();
    const role = String(req.user?.role ?? "USER").toUpperCase();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const attachment = await prisma.supportTicketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
      },
      include: {
        ticket: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    if (role !== "ADMIN" && attachment.ticket.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const r2 = getDualProviders().r2;
    const r2Key = splitSupportObjectKey(attachment.objectKey);
    const signedUrl = await r2.getArtifactUrl("support-tickets", r2Key);
    return res.json({ url: signedUrl, expiresInSeconds: 3600 });
  } catch {
    return res.status(500).json({ error: "Failed to generate attachment download link" });
  }
});

supportRouter.get("/notifications", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const result = await listSupportNotifications(userId);
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "Failed to load support notifications" });
  }
});

supportRouter.post("/notifications/read", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const userId = String(req.user?.id ?? "").trim();
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    const body = notificationReadSchema.parse(req.body ?? {});
    if (!body.markAll && (!body.notificationIds || body.notificationIds.length === 0)) {
      return res.status(400).json({ error: "notificationIds or markAll is required" });
    }
    const updatedCount = await markSupportNotificationsRead(userId, body.notificationIds, body.markAll);
    return res.json({ updatedCount });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation failed", details: error.errors });
    }
    return res.status(500).json({ error: "Failed to update support notifications" });
  }
});
