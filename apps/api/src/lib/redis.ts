import { Redis } from "ioredis";

const primaryRedisUrl = String(process.env.REDIS_URL ?? "").trim();
const fallbackRedisUrl = String(process.env.REDIS_PUBLIC_URL ?? "").trim();

export const redisUrl = primaryRedisUrl || fallbackRedisUrl;
export const redisUrlSource = primaryRedisUrl ? "REDIS_URL" : fallbackRedisUrl ? "REDIS_PUBLIC_URL" : "missing";

console.log("🚨 REDIS URL =", redisUrl);

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 20000,
  tls: undefined,
});

redis.on("connect", () => console.log("✅ Redis CONNECTED"));
redis.on("ready", () => console.log("✅ Redis READY"));
redis.on("error", (err) => console.error("❌ Redis ERROR:", err));

export const connection = redis;