import Redis from "ioredis";

export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 15000,
  commandTimeout: 15000,
  lazyConnect: true,
  retryStrategy(times) {
    return Math.min(times * 300, 3000);
  },
});

export const connection = redis;

redis.on("connect", () => console.log("Redis connected"));
redis.on("ready", () => console.log("Redis ready"));
redis.on("error", (err) => console.error("Redis error:", err));
