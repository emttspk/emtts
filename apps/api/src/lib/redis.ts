import { Redis } from "ioredis";

const redisUrl = String(process.env.REDIS_URL ?? "").trim();

if (!redisUrl) {
  throw new Error("REDIS_URL is missing");
}

export const redis = new Redis(redisUrl, {
  tls: redisUrl.startsWith("rediss://") ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const connection = redis;
