import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "";

console.log("🚨 REDIS URL =", redisUrl);

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 20000,
  tls: {
    rejectUnauthorized: false,
  },
});

redis.on("connect", () => console.log("✅ Redis CONNECTED"));
redis.on("ready", () => console.log("✅ Redis READY"));
redis.on("error", (err) => console.error("❌ Redis ERROR:", err));

export const connection = redis;