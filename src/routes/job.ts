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

    // Add to BullMQ queue - use "jobs" queue name to match the worker
    if (type === "scheduled") {
      const delay = Math.max(new Date(scheduledAt).getTime() - Date.now(), 0);

      console.log("current time:", new Date().toISOString());
      console.log("Scheduled at:", new Date(scheduledAt).toISOString());
      console.log("Scheduling job with delay (ms):", delay);
      await jobQueue.add("jobs", jobData, { delay });
    } else if (type === "retry") {
      // For recurring jobs: run immediately, then repeat
      console.log("🔄 Adding recurring job - will run immediately, then every", intervalMinutes, "minutes");
      
      // Add job to run immediately first
      await jobQueue.add("jobs", jobData);
      
      // Then add the recurring job with proper interval
      const intervalMs = intervalMinutes * 60 * 1000;
      await jobQueue.add("jobs", jobData, {
        delay: intervalMs, // Start repeating after first interval
        repeat: { 
          every: intervalMs,
          immediately: false // Don't run immediately, we already added it above
        }
      });
    }

    return { message: "Job scheduled", job };
  });

  fastify.get("/jobs", async () => {
    return JobModel.find();
  });

  // Get detailed job information including logs
  fastify.get("/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const job = await JobModel.findById(id);
      
      if (!job) {
        return reply.status(404).send({ error: "Job not found" });
      }

      return {
        success: true,
        data: job
      };
    } catch (error) {
      console.error("❌ Error getting job:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get job",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get job logs for debugging
  fastify.get("/jobs/:id/logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { level, limit = 100, source } = request.query as { level?: string; limit?: number; source?: string };
    
    try {
      const job = await JobModel.findById(id);
      
      if (!job) {
        return reply.status(404).send({ error: "Job not found" });
      }

      let logs = (job.logs || []).map(log => log.toObject());
      
      // Filter by log level if specified
      if (level) {
        logs = logs.filter(log => log.level === level.toUpperCase());
      }
      
      // Filter by source if specified (e.g., 'service_function')
      if (source) {
        logs = logs.filter(log => log.source === source);
      }
      
      // Sort by timestamp (newest first) and limit
      logs = logs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      return {
        success: true,
        data: {
          jobId: id,
          action: job.action,
          status: job.status,
          totalLogs: job.logs?.length || 0,
          filteredLogs: logs.length,
          filters: { level, source, limit },
          logs: logs
        }
      };
    } catch (error) {
      console.error("❌ Error getting job logs:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get job logs",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get only service function logs from a job
  fastify.get("/jobs/:id/service-logs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { level, limit = 100 } = request.query as { level?: string; limit?: number };
    
    try {
      const job = await JobModel.findById(id);
      
      if (!job) {
        return reply.status(404).send({ error: "Job not found" });
      }

      let logs = (job.serviceLogs || []).map(log => log.toObject());
      
      // Filter by log level if specified
      if (level) {
        logs = logs.filter(log => log.level === level.toUpperCase());
      }
      
      // Sort by timestamp (newest first) and limit
      logs = logs
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      return {
        success: true,
        data: {
          jobId: id,
          action: job.action,
          status: job.status,
          totalServiceLogs: logs.length,
          filters: { level, limit },
          logs: logs
        }
      };
    } catch (error) {
      console.error("❌ Error getting service logs:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get service logs",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get failed jobs with error details
  fastify.get("/jobs/failed", async (request, reply) => {
    const { limit = 50 } = request.query as { limit?: number };
    
    try {
      const failedJobs = await JobModel.find({ status: "failed" })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .select('_id action payload status errorDetails logs lastRunAt createdAt');

      return {
        success: true,
        data: {
          count: failedJobs.length,
          jobs: failedJobs.map(job => ({
            id: job._id,
            action: job.action,
            status: job.status,
            lastRunAt: job.lastRunAt,
            createdAt: job.createdAt,
            errorDetails: job.errorDetails,
            logCount: job.logs?.length || 0,
            lastErrorLog: job.logs?.filter(log => log.level === 'ERROR').pop()
          }))
        }
      };
    } catch (error) {
      console.error("❌ Error getting failed jobs:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get failed jobs",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
