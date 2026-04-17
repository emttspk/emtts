import { Redis } from "ioredis";

const redisUrl = String(process.env.REDIS_URL ?? "").trim();

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 10000,
  commandTimeout: 10000,
  lazyConnect: true,
  retryStrategy(times) {
    return Math.min(times * 500, 5000);
  },
});

export const connection = redis;

redis.on("connect", () => console.log("[Redis] Redis connected"));
redis.on("ready", () => console.log("[Redis] Redis ready"));
redis.on("error", (err) => console.error("[Redis] Redis error:", err));
