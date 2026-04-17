export { connection, redis } from "../lib/redis.js";
import { redis } from "../lib/redis.js";

export function getRedisConnection() {
  return redis;
}

/**
 * Ensure Redis is connected before performing queue operations.
 * With lazyConnect=false the connection is initiated on module load,
 * so this mainly verifies liveness and logs status once.
 */
export async function ensureRedisConnection() {
  // Only attempt explicit connect if the client has not started yet
  if (redis.status === "wait") {
    console.log("Redis connecting...");
    await redis.connect();
  }

  // Verify the connection is alive
  await redis.ping();
  console.log("[Redis] ensureRedisConnection: ping OK (status=%s)", redis.status);
  return redis;
}
