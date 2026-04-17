export { connection } from "../lib/redis.js";
import { connection } from "../lib/redis.js";

export function getRedisConnection() {
  return connection;
}

export async function ensureRedisConnection() {
  return connection;
}
