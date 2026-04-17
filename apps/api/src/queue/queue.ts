import { Queue } from "bullmq";
import { connection } from "./redis.js";

export const labelQueueName = "label-generation";
export const trackingQueueName = "tracking-engine";

function createLazyQueue(name: string, defaultJobOptions: unknown) {
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

export const labelQueue = createLazyQueue(labelQueueName, {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
  timeout: 60_000,
});

export const trackingQueue = createLazyQueue(trackingQueueName, {
  attempts: 2,
  backoff: { type: "exponential", delay: 10_000 },
  timeout: 60_000,
});
