import { Queue } from "bullmq";
import { redisConnection } from "./redis.js";

export const labelQueueName = "label-generation";
export const trackingQueueName = "tracking-engine";

export const labelQueue = new Queue(labelQueueName, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
  },
});

export const trackingQueue = new Queue(trackingQueueName, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },
  },
});
