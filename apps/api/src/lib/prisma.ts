import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Guard: DATABASE_URL must be present before attempting Prisma instantiation.
// Without it, Prisma throws P1012 (environment variable not found) which crashes the process.
// The worker start.sh already redirects to idle.js when DATABASE_URL is missing.
// This guard is a secondary defence in case the check is bypassed.
if (!String(process.env.DATABASE_URL ?? "").trim()) {
  console.error("[prisma] DATABASE_URL is not set. Prisma client cannot be initialized.");
  console.error("[prisma] The worker will stay idle. Set DATABASE_URL in Railway environment variables.");
}

// Custom log handler to reduce noise: convert update notices to info, suppress redundant errors
function prismaLogFilter(event: any) {
  const level = event?.level ?? "unknown";
  const message = event?.message ?? "";

  // Convert update notices to info level to prevent Railway log rate limiting
  if (level === "error" && message.includes("Update notice")) {
    console.info(`[prisma-info] ${message}`);
    return;
  }

  // Skip redundant connection pool messages
  if (message.includes("connection pool")) {
    return;
  }

  // Log actual errors/warnings as normal
  if (level === "error") {
    console.error(`[prisma] ${message}`);
  } else if (level === "warn") {
    console.warn(`[prisma] ${message}`);
  }
}

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      {
        emit: "event",
        level: "error",
      },
      {
        emit: "event",
        level: "warn",
      },
    ],
  });

// Attach event handlers for log filtering
(prisma as any).$on("error", prismaLogFilter);
(prisma as any).$on("warn", prismaLogFilter);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
