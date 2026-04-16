import { PrismaClient } from "@prisma/client";

let prismaClient: PrismaClient | null = null;

export function getPrisma() {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

export async function ensureDatabaseConnection() {
  try {
    const prisma = getPrisma();
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log("Database connection verified.");
    return true;
  } catch (err) {
    console.error("Database connection failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
