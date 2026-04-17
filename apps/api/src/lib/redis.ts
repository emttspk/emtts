import IORedis from "ioredis";

// @ts-expect-error ioredis default import is constructable at runtime in this project setup.
export const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,

  // CRITICAL FOR RAILWAY
  tls: process.env.REDIS_URL?.startsWith("rediss://") ? {} : undefined,
  family: 0,

  connectTimeout: 15000,
  commandTimeout: 15000,

  retryStrategy(times) {
    return Math.min(times * 300, 3000);
  },
});

connection.on("connect", () => {
  console.log("Redis connected");
});

connection.on("ready", () => {
  console.log("Redis ready");
});

connection.on("error", (err) => {
  console.error("Redis error:", err);
});
