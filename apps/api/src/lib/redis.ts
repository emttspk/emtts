import { Redis as IORedis } from "ioredis";

const redisUrl = String(process.env.REDIS_URL || "").trim();

if (!redisUrl) {
  throw new Error("REDIS_URL is missing");
}

export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  tls: redisUrl.startsWith("rediss://") ? {} : undefined,
});

redis.on("connect", () => console.log("✅ Redis CONNECTED"));
redis.on("ready", () => console.log("✅ Redis READY"));
redis.on("error", (err) => console.error("❌ Redis ERROR:", err));

export const connection = redis;