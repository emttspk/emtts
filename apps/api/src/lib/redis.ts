import { Redis } from "ioredis";

const redisUrl = String(process.env.REDIS_URL ?? "").trim();

if (!redisUrl) {
  throw new Error("REDIS_URL is missing");
}

console.log("🔌 Connecting to Redis...");

export const redis = new Redis(redisUrl, {
  // Pass {} for TLS so Node uses the system CA bundle; leave undefined for plain redis://
  // Do NOT set lazyConnect: true — BullMQ calls .duplicate() internally and those
  // duplicated connections must auto-connect, otherwise they stall and ETIMEDOUT.
  tls: redisUrl.startsWith("rediss://") ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 10000,
  retryStrategy: (times) => {
    console.warn("Redis retry attempt:", times);
    return Math.min(times * 200, 2000);
  },
});

export const connection = redis;

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("ready",   () => console.log("🚀 Redis ready"));
redis.on("error",   (err: Error) => console.error("❌ Redis error:", err.message));
redis.on("close",   () => console.warn("⚠️ Redis connection closed"));
