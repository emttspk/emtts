import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const jobsQueueName = "jobs";

let queue: Queue | null = null;

export function getQueue() {
  if (!queue) {
    console.log("Initializing queue...");
    queue = new Queue(jobsQueueName, { connection: redis });
  }
  return queue;
}
