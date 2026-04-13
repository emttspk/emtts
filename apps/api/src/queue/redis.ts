import IORedis from "ioredis";
import { env } from "../config.js";

export const redisConnection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 200, 5_000),
});
