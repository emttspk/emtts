import { Queue } from "bullmq";
import { redis } from "./redis.js";

export const jobsQueueName = "jobs";

export const jobQueue = new Queue(jobsQueueName, {
  connection: redis,
});
