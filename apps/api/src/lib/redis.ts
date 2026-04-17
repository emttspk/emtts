import IORedis from "ioredis";

// @ts-expect-error ioredis default import is constructable at runtime in this project setup.
export const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,

  // REQUIRED FOR RAILWAY TLS
  tls: {},
  family: 0,

  connectTimeout: 20000,
  commandTimeout: 20000,

  retryStrategy(times) {
    return Math.min(times * 500, 5000);
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
