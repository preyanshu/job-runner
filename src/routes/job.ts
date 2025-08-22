import { FastifyInstance } from "fastify";
import { Job as JobModel } from "../models/Job";
import { jobQueue } from "../queue/jobQueue";
// import { Console } from "console";

export default async function jobRoutes(fastify: FastifyInstance) {
  fastify.post("/jobs", async (request, reply) => {
    const { action, payload, type, scheduledAt, intervalMinutes } = request.body as any;

    // Validate required fields based on type
    if (type === "scheduled" && !scheduledAt) {
      return reply.status(400).send({ error: "scheduledAt is required for scheduled jobs" });
    }
    if (type === "retry" && !intervalMinutes) {
      return reply.status(400).send({ error: "intervalMinutes is required for retry jobs" });
    }

    // Create job in Mongo
    const job = await JobModel.create({
      action,
      payload,
      type,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      intervalMinutes: intervalMinutes ? Number(intervalMinutes) : undefined,
      status: "pending"
    });

    // Prepare full data to pass to the queue
    const jobData = {
      jobId: job._id,
      action,
      payload,
      type,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      intervalMinutes: intervalMinutes ? Number(intervalMinutes) : undefined
    };

    // Add to BullMQ queue
    if (type === "scheduled") {
      const delay = Math.max(new Date(scheduledAt).getTime() - Date.now(), 0);

      console.log("current time:", new Date().toISOString());
      console.log("Scheduled at:", new Date(scheduledAt).toISOString());
      console.log("Scheduling job with delay (ms):", delay);
      await jobQueue.add("execute-job", jobData, { delay });
    } else if (type === "retry") {
      await jobQueue.add("execute-job", jobData, {
        repeat: { every: intervalMinutes * 60 * 1000 }
      });
    }

    return { message: "Job scheduled", job };
  });

  fastify.get("/jobs", async () => {
    return JobModel.find();
  });
}
