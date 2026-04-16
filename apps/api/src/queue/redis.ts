import { Redis } from "ioredis";
import { env } from "../config.js";

let redisConnection;

export function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      enableOfflineQueue: true,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    });
    redisConnection.on("error", (err) => {
      console.error("Redis connection error:", err instanceof Error ? err.message : err);
    });
  }
  return redisConnection;
}

export async function ensureRedisConnection() {
  const redis = getRedisConnection();
  try {
    await redis.ping();
    return redis;
  } catch {
    // no-op, reconnect below
  }

  if (redis.status === "wait" || redis.status === "close" || redis.status === "end") {
    try {
      await redis.connect();
    } catch {
      // ignore connect race errors
    }
  }

  await redis.ping();
  return redis;
}
