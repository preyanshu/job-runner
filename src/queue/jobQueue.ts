import { Queue } from "bullmq";
import { config } from "../config";
import IORedis from "ioredis";

// Redis connection for BullMQ
const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false      // often needed for managed Redis
});

// Create the queue
export const jobQueue = new Queue("jobs", { connection });
