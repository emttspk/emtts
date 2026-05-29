import { prisma } from "../lib/prisma.js";

type CreateSupportNotificationInput = {
  userId?: string | null;
  ticketId: string;
  type: string;
  title: string;
  message: string;
};

const SUPPORT_NOTIFICATION_SELECT = {
  id: true,
  userId: true,
  ticketId: true,
  type: true,
  title: true,
  message: true,
  isRead: true,
  createdAt: true,
  ticket: {
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      status: true,
      priority: true,
    },
  },
} as const;

export async function createSupportNotification(input: CreateSupportNotificationInput) {
  return prisma.supportTicketNotification.create({
    data: {
      userId: input.userId ?? null,
      ticketId: input.ticketId,
      type: input.type,
      title: input.title,
      message: input.message,
    },
  });
}

export async function listSupportNotifications(userId: string, limit = 20) {
  const where = { userId };
  const [notifications, unreadCount] = await Promise.all([
    prisma.supportTicketNotification.findMany({
      where,
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: SUPPORT_NOTIFICATION_SELECT,
    }),
    prisma.supportTicketNotification.count({ where: { userId, isRead: false } }),
  ]);
  return { notifications, unreadCount };
}

export async function markSupportNotificationsRead(userId: string, notificationIds?: string[], markAll?: boolean) {
  if (markAll) {
    const result = await prisma.supportTicketNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  const ids = (notificationIds ?? []).filter(Boolean);
  if (ids.length === 0) return 0;

  const result = await prisma.supportTicketNotification.updateMany({
    where: {
      userId,
      id: { in: ids },
    },
    data: { isRead: true },
  });
  return result.count;
}

export async function listAdminSupportNotifications(actorUserId: string, limit = 20) {
  const where = {
    OR: [{ userId: null }, { userId: actorUserId }],
  };
  const [notifications, unreadCount] = await Promise.all([
    prisma.supportTicketNotification.findMany({
      where,
      orderBy: [{ isRead: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: SUPPORT_NOTIFICATION_SELECT,
    }),
    prisma.supportTicketNotification.count({
      where: {
        OR: [{ userId: null }, { userId: actorUserId }],
        isRead: false,
      },
    }),
  ]);
  return { notifications, unreadCount };
}

export async function markAdminSupportNotificationsRead(actorUserId: string, notificationIds?: string[], markAll?: boolean) {
  if (markAll) {
    const result = await prisma.supportTicketNotification.updateMany({
      where: {
        OR: [{ userId: null }, { userId: actorUserId }],
        isRead: false,
      },
      data: { isRead: true },
    });
    return result.count;
  }

  const ids = (notificationIds ?? []).filter(Boolean);
  if (ids.length === 0) return 0;

  const result = await prisma.supportTicketNotification.updateMany({
    where: {
      id: { in: ids },
      OR: [{ userId: null }, { userId: actorUserId }],
    },
    data: { isRead: true },
  });
  return result.count;
}