export { connection, redis } from "../lib/redis.js";
import { redis } from "../lib/redis.js";

let didLogConnected = false;
let didLogReady = false;

export function getRedisConnection() {
  return redis;
}

export async function ensureRedisConnection() {
  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
  }
  if (!didLogConnected) {
    console.log("Redis connected");
    didLogConnected = true;
  }
  await redis.ping();
  if (!didLogReady) {
    console.log("Redis ready");
    didLogReady = true;
  }
  return redis;
}
