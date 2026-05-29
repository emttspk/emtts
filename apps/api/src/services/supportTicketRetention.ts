import { prisma } from "../lib/prisma.js";
import { getDualProviders } from "../storage/provider.js";
import { splitSupportObjectKey } from "./supportTickets.js";

type CleanupResult = {
  scannedTickets: number;
  deletedTickets: number;
  deletedAttachments: number;
};

export async function cleanupExpiredSupportTickets(now = new Date()): Promise<CleanupResult> {
  const tickets = await prisma.supportTicket.findMany({
    where: {
      status: "CLOSED",
      isPreserved: false,
      deleteAfter: { lte: now },
    },
    select: {
      id: true,
      attachments: {
        select: {
          id: true,
          objectKey: true,
        },
      },
    },
  });

  if (tickets.length === 0) {
    return { scannedTickets: 0, deletedTickets: 0, deletedAttachments: 0 };
  }

  const r2 = getDualProviders().r2;
  let deletedTickets = 0;
  let deletedAttachments = 0;

  for (const ticket of tickets) {
    for (const attachment of ticket.attachments) {
      const r2Key = splitSupportObjectKey(attachment.objectKey);
      await r2.deleteArtifact("support-tickets", r2Key);
      deletedAttachments += 1;
    }

    await prisma.supportTicket.delete({ where: { id: ticket.id } });
    deletedTickets += 1;
  }

  return {
    scannedTickets: tickets.length,
    deletedTickets,
    deletedAttachments,
  };
}
