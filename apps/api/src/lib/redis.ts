import { Redis as IORedis } from "ioredis";

const redisUrl = String(process.env.REDIS_URL || "").trim();

if (!redisUrl) {
  console.error("REDIS_URL missing");
}

export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  connectTimeout: 20000,

  // force TLS for Railway
  tls: redisUrl.startsWith("rediss://") ? {} : undefined,

retryStrategy: (times) => {
  return Math.min(times * 200, 5000);
},

  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("connect", () => console.log("Redis CONNECTED"));
redis.on("ready", () => console.log("Redis READY"));
redis.on("error", (err) => console.error("Redis ERROR:", err));

export const connection = redis;
