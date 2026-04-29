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

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
