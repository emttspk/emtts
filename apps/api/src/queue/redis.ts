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
