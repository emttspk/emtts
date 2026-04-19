import { prisma } from "./lib/prisma.js";

function getDbHostFromUrl(url: string | undefined): string {
  if (!url) return "unknown";
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "invalid-url";
  }
}

export function getPrisma() {
  return prisma;
}

export async function ensureDatabaseConnection() {
  const dbUrl = process.env.DATABASE_URL;

  try {
    const prisma = getPrisma();
    await prisma.$connect();
    return true;
  } catch (err) {
    const dbHost = getDbHostFromUrl(dbUrl);
    const rawMessage = err instanceof Error ? err.message : String(err);
    const message = rawMessage.split("\n")[0]?.trim() || "Unknown database error";
    console.error(`[DB] Connection error (${dbHost}): ${message}`);
    return false;
  }
}
