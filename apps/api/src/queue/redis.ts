import { Redis } from "ioredis";
import { env } from "../config.js";

let redisConnection;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getRedisConnection() {
  if (!redisConnection) {
    const redisUrl = String(process.env.REDIS_URL ?? env.REDIS_URL ?? "").trim();
    if (!redisUrl) {
      throw new Error("Missing REDIS_URL environment variable. Set process.env.REDIS_URL to your Railway Redis connection string before starting API/worker.");
    }
    redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      enableOfflineQueue: true,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 10_000),
      commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 5_000),
      maxLoadingRetryTime: 15_000,
      retryStrategy: (times) => Math.min(times * 100, 2_000),
      reconnectOnError: () => true,
    });
    redisConnection.on("error", (err) => {
      console.error("Redis connection error:", err instanceof Error ? err.message : err);
    });
  }
  return redisConnection;
}

export async function ensureRedisConnection() {
  const redis = getRedisConnection();
  const maxAttempts = Number(process.env.REDIS_CONNECT_RETRIES ?? 5);
  const retryDelayMs = Number(process.env.REDIS_CONNECT_RETRY_DELAY_MS ?? 1_000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (redis.status === "wait" || redis.status === "close" || redis.status === "end") {
        try {
          await withTimeout(redis.connect(), 10_000, "Redis connect timed out");
        } catch {
          // ignore connect race errors and continue to ping verification
        }
      }

      await withTimeout(redis.ping(), 10_000, "Redis ping timed out");
      return redis;
    } catch (error) {
      if (attempt === maxAttempts) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to connect to Redis after ${maxAttempts} attempts: ${message}`);
      }
      await sleep(retryDelayMs);
    }
  }

  throw new Error("Redis connection failed unexpectedly");
}
