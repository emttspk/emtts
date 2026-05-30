import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";

type JsonValue = Prisma.InputJsonValue;

export const AGGREGATOR_DOCUMENT_UPLOAD_STATUSES = ["PENDING", "R2_SYNCED", "FAILED"] as const;
export const AGGREGATOR_DOCUMENT_LOCAL_CLEANUP_STATUSES = ["NOT_REQUIRED", "PENDING", "DELETED", "FAILED"] as const;

function normalizeOptionalString(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function getClientHashes(req?: Request) {
  const ipRaw = String(req?.ip ?? req?.socket?.remoteAddress ?? "").trim().toLowerCase();
  const uaRaw = String(req?.header("user-agent") ?? "").trim().toLowerCase();
  const hash = (input: string) => {
    if (!input) return null;
    return createHash("sha256").update(`aggregator-doc:${input}`).digest("hex");
  };

  return {
    ipHash: hash(ipRaw),
    userAgentHash: hash(uaRaw),
  };
}

export async function createAggregatorBookingDocumentMetadata(input: {
  bookingId: string;
  userId: string;
  actorUserId: string;
  docType: string;
  bucket: string;
  objectKey: string;
  sizeBytes?: number;
  contentType?: string;
  checksum?: string;
  originalFileName: string;
  uploadStatus?: "PENDING" | "R2_SYNCED" | "FAILED";
  localTempPath?: string;
  localCleanupStatus?: "NOT_REQUIRED" | "PENDING" | "DELETED" | "FAILED";
  req?: Request;
}) {
  const booking = await prisma.aggregatorBooking.findFirst({
    where: {
      id: input.bookingId,
      userId: input.userId,
    },
    select: {
      id: true,
    },
  });

  if (!booking) {
    throw new Error("Booking not found");
  }

  const uploadStatus = input.uploadStatus ?? "R2_SYNCED";
  const localCleanupStatus = input.localCleanupStatus ?? "NOT_REQUIRED";

  const document = await prisma.aggregatorBookingDocument.create({
    data: {
      bookingId: booking.id,
      docType: input.docType,
      storageKey: input.objectKey,
      bucket: input.bucket,
      objectKey: input.objectKey,
      sizeBytes: input.sizeBytes ?? null,
      contentType: normalizeOptionalString(input.contentType),
      checksum: normalizeOptionalString(input.checksum),
      uploadStatus,
      localTempPath: normalizeOptionalString(input.localTempPath),
      localCleanupStatus,
      localCleanupAttempts: 0,
      localCleanupLastError: null,
      localCleanupNextRetryAt: null,
      originalFileName: input.originalFileName,
      mimeType: normalizeOptionalString(input.contentType) ?? "application/octet-stream",
      uploadedByUserId: input.actorUserId,
    },
  });

  const hashes = getClientHashes(input.req);
  await prisma.aggregatorBookingAuditLog.create({
    data: {
      bookingId: booking.id,
      action: "BOOKING_DOCUMENT_METADATA_ATTACHED",
      actorType: "CUSTOMER",
      actorUserId: input.actorUserId,
      targetField: "documents",
      oldValueJson: undefined,
      newValueJson: {
        documentId: document.id,
        docType: document.docType,
        bucket: document.bucket,
        objectKey: document.objectKey,
        uploadStatus: document.uploadStatus,
        localCleanupStatus: document.localCleanupStatus,
      } as unknown as JsonValue,
      ipHash: hashes.ipHash,
      userAgentHash: hashes.userAgentHash,
    },
  });

  return document;
}

export async function listAggregatorBookingDocumentsForUser(input: { bookingId: string; userId: string }) {
  const booking = await prisma.aggregatorBooking.findFirst({
    where: {
      id: input.bookingId,
      userId: input.userId,
    },
    select: { id: true },
  });

  if (!booking) {
    throw new Error("Booking not found");
  }

  return prisma.aggregatorBookingDocument.findMany({
    where: { bookingId: booking.id },
    orderBy: { createdAt: "desc" },
  });
}
