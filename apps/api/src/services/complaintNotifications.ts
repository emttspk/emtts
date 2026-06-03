import { prisma } from "../lib/prisma.js";

export type ComplaintNotificationType =
  | "complaint_filed"
  | "complaint_status_changed"
  | "complaint_resolved"
  | "complaint_closed"
  | "complaint_failed"
  | "complaint_reopened";

interface CreateComplaintNotificationInput {
  userId: string;
  trackingId: string;
  type: ComplaintNotificationType;
  title: string;
  message: string;
}

/**
 * Create a complaint notification for a user
 */
export async function createComplaintNotification(input: CreateComplaintNotificationInput) {
  try {
    const notification = await prisma.complaintNotification.create({
      data: {
        userId: input.userId,
        trackingId: input.trackingId,
        type: input.type,
        title: input.title,
        message: input.message,
        isRead: false,
      },
    });
    return { ok: true, notificationId: notification.id };
  } catch (error) {
    console.error(`[ComplaintNotifications] Failed to create notification:`, error instanceof Error ? error.message : error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * List unread complaint notifications for a user
 */
export async function listComplaintNotifications(userId: string, limit: number = 20) {
  try {
    const notifications = await prisma.complaintNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { ok: true, notifications };
  } catch (error) {
    console.error(`[ComplaintNotifications] Failed to list notifications:`, error instanceof Error ? error.message : error);
    return { ok: false, notifications: [], error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Get count of unread complaint notifications
 */
export async function getUnreadComplaintNotificationCount(userId: string) {
  try {
    const count = await prisma.complaintNotification.count({
      where: { userId, isRead: false },
    });
    return { ok: true, count };
  } catch (error) {
    console.error(`[ComplaintNotifications] Failed to count notifications:`, error instanceof Error ? error.message : error);
    return { ok: false, count: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Mark complaint notifications as read
 */
export async function markComplaintNotificationsRead(userId: string, notificationIds?: string[]) {
  try {
    const result = await prisma.complaintNotification.updateMany({
      where: {
        userId,
        ...(notificationIds && notificationIds.length > 0 ? { id: { in: notificationIds } } : {}),
      },
      data: { isRead: true },
    });
    return { ok: true, updatedCount: result.count };
  } catch (error) {
    console.error(`[ComplaintNotifications] Failed to mark as read:`, error instanceof Error ? error.message : error);
    return { ok: false, updatedCount: 0, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Mark all complaint notifications for a user as read
 */
export async function markAllComplaintNotificationsRead(userId: string) {
  return markComplaintNotificationsRead(userId);
}
