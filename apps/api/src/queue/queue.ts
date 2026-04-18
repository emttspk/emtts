import { Queue, type JobsOptions } from "bullmq";
import { connection } from "./redis.js";
import { getQueue, jobsQueueName } from "../lib/queue.js";

export const labelQueueName = jobsQueueName;
export const trackingQueueName = "tracking-engine";

function createLazyQueue(name: string, defaultJobOptions: JobsOptions | undefined) {
  let queue: Queue | null = null;

  const create = () => {
    if (!queue) {
      queue = new Queue(name, {
        connection,
        defaultJobOptions,
      });
    }
    return queue;
  };

  return new Proxy({} as Queue, {
    get(_target, prop) {
      const instance = create();
      const value = (instance as any)[prop];
      return typeof value === "function" ? value.bind(instance) : value;
    },
    set(_target, prop, value) {
      const instance = create();
      (instance as any)[prop] = value;
      return true;
    },
  });
}

export const labelQueue = new Proxy({} as Queue, {
  get(_target, prop) {
    const instance = getQueue();
    const value = (instance as any)[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
  set(_target, prop, value) {
    const instance = getQueue();
    (instance as any)[prop] = value;
    return true;
  },
});

export const trackingQueue = createLazyQueue(trackingQueueName, {
  attempts: 2,
  backoff: { type: "exponential", delay: 10_000 },
  timeout: 60_000,
} as any);
