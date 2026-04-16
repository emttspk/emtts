import { PrismaClient } from "@prisma/client";

let prismaClient: PrismaClient | null = null;

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
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

export async function ensureDatabaseConnection() {
  const dbUrl = process.env.DATABASE_URL;
  const dbHost = getDbHostFromUrl(dbUrl);
  
  console.log(`[DB] Connecting to database at host: ${dbHost}`);
  console.log(`[DB] DATABASE_URL is set: ${dbUrl ? "yes" : "no"}`);
  
  if (dbUrl) {
    // Log sanitized URL (remove password)
    const sanitized = dbUrl.replace(/([^:])([a-zA-Z0-9]+)@/, "$1***@");
    console.log(`[DB] Connection string (sanitized): ${sanitized}`);
  }
  
  try {
    const prisma = getPrisma();
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log(`[DB] ✓ Database connection verified at ${dbHost}`);
    return true;
  } catch (err) {
    console.error(`[DB] ✗ Connection failed to ${dbHost}:`, err instanceof Error ? err.message : err);
    return false;
  }
}
