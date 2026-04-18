export { connection, redis } from "../lib/redis.js";
import { redis, redisEnabled } from "../lib/redis.js";

export function getRedisConnection() {
  return redis;
}

/**
 * Ensure Redis is connected before performing queue operations.
 * With lazyConnect=false the connection is initiated on module load,
 * so this mainly verifies liveness and logs status once.
 */
export async function ensureRedisConnection() {
  if (!redisEnabled) {
    throw new Error("REDIS_URL is missing or placeholder");
  }

  const status = redis.status;

  if (status === "wait" || status === "end" || status === "close") {
    console.log(`[Redis] connecting (status=${status})...`);
    await redis.connect();
  }

  // Verify the connection is alive
  await redis.ping();
  console.log("[Redis] ensureRedisConnection: ping OK (status=%s)", redis.status);
  return redis;
}
