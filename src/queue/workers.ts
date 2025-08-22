import { Worker } from "bullmq";
import { config } from "../config";
import IORedis from "ioredis";
import { Job as JobModel } from "../models/Job";
import { jobQueue } from "../queue/jobQueue"; // <-- use the queue instance

const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const jobWorker = new Worker(
  "jobs",
  async (job) => {
    console.log("⚡ Running job:", job.id, job.data);

    const { jobId, type, scheduledAt, intervalMinutes, payload } = job.data;

    try {
      if (type === "scheduled") {
        if (scheduledAt && new Date(scheduledAt) > new Date()) {
          console.log("⏳ Scheduled time not reached yet, skipping job:", jobId);
          return;
        }

        console.log("✅ Running scheduled job:", jobId);
        await runTask(payload);

        await JobModel.findByIdAndUpdate(jobId, { status: "completed", lastRunAt: new Date() });
      } 
      else if (type === "retry") {
        console.log("🔄 Running recurring/retry job:", jobId);

        await runTask(payload);

        const nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000);
        await JobModel.findByIdAndUpdate(jobId, { lastRunAt: new Date(), nextRunAt: nextRun });

        // Use the **queue instance directly** to re-add job
        await jobQueue.add(
          "jobs",
          { jobId, type, intervalMinutes, payload },
          { delay: intervalMinutes * 60 * 1000 }
        );
      } 
      else {
        console.warn("⚠️ Unknown job type:", type);
      }
    } catch (err) {
      console.error("❌ Job failed:", jobId, err);
      await JobModel.findByIdAndUpdate(jobId, { status: "failed", error: String(err) });
    }
  },
  { connection }
);

async function runTask(payload: any) {
  console.log("🏗️ Running task with payload:", payload);
  await new Promise((r) => setTimeout(r, 2000));
}
