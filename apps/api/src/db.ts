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
  const dbHost = getDbHostFromUrl(dbUrl);
  
  console.log(`[DB] DATABASE_URL is set: ${dbUrl ? "yes" : "no"}`);
  
  if (dbUrl) {
    // Log sanitized URL (remove password)
    const sanitized = dbUrl.replace(/([^:])([a-zA-Z0-9]+)@/, "$1***@");
    console.log(`[DB] Connection string (sanitized): ${sanitized}`);
    
    // Diagnostic: identify which database is being connected to
    const isLocalhost = dbHost.includes("localhost") || dbHost === "127.0.0.1" || dbHost === "0.0.0.0";
    const environment = process.env.NODE_ENV === "production" ? "PRODUCTION" : "DEVELOPMENT";
    console.log(`[DB] Environment: ${environment}`);
    console.log(`[DB] Connecting to ${isLocalhost ? "LOCAL" : "REMOTE"} database at host: ${dbHost}`);
    
    if (isLocalhost && environment === "PRODUCTION") {
      console.warn(`[DB] ⚠️  WARNING: Production environment but connecting to localhost!`);
      console.warn(`[DB] This will fail - ensure DATABASE_URL is set from Railway PostgreSQL service`);
    }
  }
  
  try {
    const prisma = getPrisma();
    await prisma.$connect();
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    console.log(`[DB] ✓ Database connection verified at ${dbHost}`);
    return true;
  } catch (err) {
    console.error(`[DB] ✗ Connection failed to ${dbHost}:`, err instanceof Error ? err.message : err);
    if (err instanceof Error && err.message.includes("ECONNREFUSED")) {
      console.error(`[DB] This is a connection refused error - the database host is not accessible`);
      console.error(`[DB] Check that DATABASE_URL points to a running database`);
    }
    return false;
  }
}
