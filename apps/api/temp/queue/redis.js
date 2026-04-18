import { Redis } from "ioredis";
const redisUrl = String(process.env.REDIS_URL || "").trim();
if (!redisUrl) {
    throw new Error("REDIS_URL is missing");
}
export const redisConnection = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
});
