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

export async function ensureDatabaseConnection(retries = 5, delayMs = 2000) {
  const dbUrl = process.env.DATABASE_URL;
  const dbHost = getDbHostFromUrl(dbUrl);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const p = getPrisma();
      await p.$connect();
      if (attempt > 1) {
        console.log(`[DB] Connected on attempt ${attempt} (${dbHost})`);
      }
      return true;
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const message = rawMessage.split("\n")[0]?.trim() || "Unknown database error";
      console.error(`[DB] Connection error attempt ${attempt}/${retries} (${dbHost}): ${message}`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  console.error(`[DB] All ${retries} connection attempts failed (${dbHost})`);
  return false;
}
