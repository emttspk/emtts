export { connection, redis } from "../lib/redis.js";
import { redis } from "../lib/redis.js";

export function getRedisConnection() {
  return redis;
}

export async function ensureRedisConnection() {
  if (redis.status === "wait") {
    await redis.connect();
  }
  await redis.ping();
  return redis;
}
