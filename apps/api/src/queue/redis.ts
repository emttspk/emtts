import { Redis as IORedis } from "ioredis";

const redisUrl = String(process.env.REDIS_URL ?? "").trim();

if (!redisUrl) {
  throw new Error("Missing REDIS_URL environment variable. Set process.env.REDIS_URL before starting API/worker.");
}

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: false,
  connectTimeout: 10000,
  commandTimeout: 10000,
  retryStrategy: (times) => {
    return Math.min(times * 200, 2000);
  },
});

connection.on("connect", () => {
  console.log("Redis connected");
});

connection.on("error", (err) => {
  console.error("Redis error:", err);
});

export function getRedisConnection() {
  return connection;
}

export async function ensureRedisConnection() {
  return connection;
}
