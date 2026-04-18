import { Redis as IORedis } from "ioredis";

const redisUrl = String(process.env.REDIS_URL || "").trim();
const hasUsableRedisUrl = !!redisUrl && !/(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(redisUrl);
const connectionUrl = hasUsableRedisUrl ? redisUrl : "redis://127.0.0.1:6379";

if (!hasUsableRedisUrl) {
  console.warn("[Redis] REDIS_URL is missing or placeholder. Redis will stay disabled until a real URL is configured.");
}

export const redis = new IORedis(connectionUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  lazyConnect: true,
  tls: connectionUrl.startsWith("rediss://") ? {} : undefined,
});

redis.on("connect", () => console.log("✅ Redis CONNECTED"));
redis.on("ready", () => console.log("✅ Redis READY"));
redis.on("error", (err) => console.error("❌ Redis ERROR:", err));

export const connection = redis;
export const redisEnabled = hasUsableRedisUrl;