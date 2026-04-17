import { Redis, type RedisOptions } from "ioredis";

const redisUrl = String(process.env.REDIS_URL ?? "").trim();

const tlsOptions: RedisOptions = redisUrl.startsWith("rediss://")
  ? { tls: { rejectUnauthorized: false } }
  : {};

export const redis = new Redis(redisUrl, {
  ...tlsOptions,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 10000,
  commandTimeout: 10000,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

export const connection = redis;

redis.on("connect", () => console.log("Redis connected"));
redis.on("ready", () => console.log("[Redis] Redis ready"));
redis.on("error", (err) => console.error("Redis error", err));
