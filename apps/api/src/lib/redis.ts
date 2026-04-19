import { Redis as IORedis } from "ioredis";

const redisUrl = String(process.env.REDIS_URL || "").trim();
const isProduction = process.env.NODE_ENV === "production";
const hasPlaceholderRedisUrl = /(^|[:@/])HOST([:@/]|$)|(^|[:@/])PASSWORD([:@/]|$)/i.test(redisUrl);
const hasLocalRedisInProduction = isProduction && /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(redisUrl);
const hasUsableRedisUrl = !!redisUrl && !hasPlaceholderRedisUrl && !hasLocalRedisInProduction;
const connectionUrl = hasUsableRedisUrl ? redisUrl : "redis://redis.invalid:6379";

if (!hasUsableRedisUrl) {
  if (hasLocalRedisInProduction) {
    console.warn("[Redis] REDIS_URL points to localhost in production. Redis will stay disabled until an external Redis URL is configured.");
  } else {
    console.warn("[Redis] REDIS_URL is missing or placeholder. Redis will stay disabled until a real URL is configured.");
  }
}

export const redis = new IORedis(connectionUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 10000,
  lazyConnect: true,
  // Never run endless reconnect loops when Redis URL is missing or invalid.
  retryStrategy: () => null,
  enableOfflineQueue: false,
  tls: connectionUrl.startsWith("rediss://") ? {} : undefined,
});

redis.on("connect", () => console.log("✅ Redis CONNECTED"));
redis.on("ready", () => console.log("✅ Redis READY"));
redis.on("error", (err) => console.error("❌ Redis ERROR:", err));

export const connection = redis;
export const redisEnabled = hasUsableRedisUrl;