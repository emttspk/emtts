import { Redis, type RedisOptions } from "ioredis";

const redisUrl = String(process.env.REDIS_URL ?? "").trim();

// TLS is required for Railway Redis (rediss:// scheme)
// Use {} so Node.js picks up the system CA bundle automatically
const tlsOptions: RedisOptions = redisUrl.startsWith("rediss://")
  ? { tls: {} }
  : {};

console.log("Redis connecting...");

export const redis = new Redis(redisUrl, {
  ...tlsOptions,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // Do NOT use lazyConnect: true — BullMQ calls .duplicate() internally and
  // those duplicated connections must auto-connect or they time out (ETIMEDOUT).
  lazyConnect: false,
  connectTimeout: 10000,
  // Slow retry back-off: 200ms → 400ms → ... capped at 5000ms
  // Avoids hammering a restarting Redis and triggering connection-closed errors
  retryStrategy: (times) => {
    if (times > 20) return null; // Give up after 20 retries, let ioredis emit error
    return Math.min(times * 200, 5000);
  },
});

export const connection = redis;

redis.on("connecting", () => console.log("Redis connecting..."));
redis.on("connect",    () => console.log("Redis connected"));
redis.on("ready",      () => console.log("[Redis] Redis ready"));
redis.on("close",      () => console.warn("[Redis] Connection closed"));
redis.on("reconnecting", (delay: number) => console.log(`[Redis] Reconnecting in ${delay}ms`));
redis.on("error",      (err: Error) => console.error("Redis error", err.message));
