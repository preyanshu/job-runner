import { FastifyInstance } from "fastify";
import { Job as JobModel } from "../models/Job";
import { jobQueue } from "../queue/jobQueue";
import { getNetworkConfig, DEFAULT_NETWORK, isValidNetwork } from "../config/networks";
// import { Console } from "console";

export default async function jobRoutes(fastify: FastifyInstance) {
  fastify.post("/jobs", async (request, reply) => {
    const { action, payload, type, scheduledAt, intervalMinutes, network = DEFAULT_NETWORK } = request.body as any;
    
    // Validate network parameter
    if (!isValidNetwork(network)) {
      return reply.status(400).send({ 
        error: `Invalid network: ${network}. Supported networks: ${Object.keys(getNetworkConfig('testnet')).join(', ')}`
      });
    }

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
      network,
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
      network,
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

  // Clear all running jobs - Emergency stop endpoint
  fastify.delete("/jobs/clear-all", async (request, reply) => {
    try {
      console.log("🚨 Emergency stop: Clearing all running jobs...");
      
      // Get current queue status
      const waitingJobs = await jobQueue.getWaiting();
      const activeJobs = await jobQueue.getActive();
      const delayedJobs = await jobQueue.getDelayed();
      const repeatingJobs = await jobQueue.getRepeatableJobs();
      
      let clearedCount = 0;
      let stoppedCount = 0;
      let errors = [];

      // Clear waiting jobs
      for (const job of waitingJobs) {
        try {
          await job.remove();
          clearedCount++;
          console.log(`🗑️ Cleared waiting job: ${job.id}`);
        } catch (error) {
          errors.push(`Failed to clear waiting job ${job.id}: ${error}`);
        }
      }

      // Stop active jobs (these are currently running)
      for (const job of activeJobs) {
        try {
          await job.moveToFailed(new Error("Job stopped by emergency clear"), "0", true);
          stoppedCount++;
          console.log(`⏹️ Stopped active job: ${job.id}`);
        } catch (error) {
          errors.push(`Failed to stop active job ${job.id}: ${error}`);
        }
      }

      // Clear delayed jobs
      for (const job of delayedJobs) {
        try {
          await job.remove();
          clearedCount++;
          console.log(`🗑️ Cleared delayed job: ${job.id}`);
        } catch (error) {
          errors.push(`Failed to clear delayed job ${job.id}: ${error}`);
        }
      }

      // Clear repeating jobs
      for (const repeatableJob of repeatingJobs) {
        try {
          await jobQueue.removeRepeatableByKey(repeatableJob.key);
          clearedCount++;
          console.log(`🗑️ Cleared repeating job: ${repeatableJob.key}`);
        } catch (error) {
          errors.push(`Failed to clear repeating job ${repeatableJob.key}: ${error}`);
        }
      }

      // Update database to mark jobs as stopped
      const updateResult = await JobModel.updateMany(
        { 
          status: { $in: ["pending", "running"] },
          type: "retry" // Only update recurring jobs
        },
        { 
          $set: { 
            status: "failed",
            "errorDetails.message": "Job stopped by emergency clear",
            "errorDetails.timestamp": new Date(),
            "errorDetails.function": "emergency_clear"
          }
        }
      );

      // Clear the entire queue
      await jobQueue.obliterate({ force: true });

      const summary = {
        success: true,
        message: "All running jobs cleared successfully",
        summary: {
          waitingJobsCleared: waitingJobs.length,
          activeJobsStopped: activeJobs.length,
          delayedJobsCleared: delayedJobs.length,
          repeatingJobsCleared: repeatingJobs.length,
          databaseJobsUpdated: updateResult.modifiedCount,
          totalCleared: clearedCount + stoppedCount
        },
        timestamp: new Date(),
        errors: errors.length > 0 ? errors : undefined
      };

      console.log("✅ Emergency clear completed:", summary);
      return summary;

    } catch (error) {
      console.error("❌ Error during emergency clear:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to clear all jobs",
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });
    }
  });

  // Get queue status - useful for monitoring
  fastify.get("/jobs/queue-status", async () => {
    try {
      const waitingJobs = await jobQueue.getWaiting();
      const activeJobs = await jobQueue.getActive();
      const delayedJobs = await jobQueue.getDelayed();
      const repeatingJobs = await jobQueue.getRepeatableJobs();
      const failedJobs = await jobQueue.getFailed();

      return {
        success: true,
        queueStatus: {
          waiting: waitingJobs.length,
          active: activeJobs.length,
          delayed: delayedJobs.length,
          repeating: repeatingJobs.length,
          failed: failedJobs.length,
          total: waitingJobs.length + activeJobs.length + delayedJobs.length + repeatingJobs.length + failedJobs.length
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error("❌ Error getting queue status:", error);
      return {
        success: false,
        error: "Failed to get queue status",
        details: error instanceof Error ? error.message : String(error)
      };
    }
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

  // Delete a job
  fastify.delete("/jobs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      // Find the job in MongoDB first
      const job = await JobModel.findById(id);
      
      if (!job) {
        return reply.status(404).send({ 
          success: false,
          error: "Job not found" 
        });
      }

      // Try to remove the job from the BullMQ queue if it's still pending/active
      try {
        // Get all jobs from the queue and find matching ones to remove
        const waitingJobs = await jobQueue.getWaiting();
        const activeJobs = await jobQueue.getActive();
        const delayedJobs = await jobQueue.getDelayed();
        const repeatingJobs = await jobQueue.getRepeatableJobs();

        let queueJobRemoved = false;

        // Check waiting jobs
        for (const queueJob of waitingJobs) {
          if (queueJob.data.jobId?.toString() === id) {
            await queueJob.remove();
            queueJobRemoved = true;
            console.log(`🗑️ Removed waiting job from queue: ${id}`);
          }
        }

        // Check delayed jobs
        for (const queueJob of delayedJobs) {
          if (queueJob.data.jobId?.toString() === id) {
            await queueJob.remove();
            queueJobRemoved = true;
            console.log(`🗑️ Removed delayed job from queue: ${id}`);
          }
        }

        // Handle repeating jobs
        for (const repeatableJob of repeatingJobs) {
          // For repeating jobs, we need to check if this job matches
          if (repeatableJob.id && repeatableJob.id.includes(id)) {
            await jobQueue.removeRepeatableByKey(repeatableJob.key);
            queueJobRemoved = true;
            console.log(`🗑️ Removed repeating job from queue: ${id}`);
          }
        }

        // Note: We don't remove active jobs as they're currently running
        const activeJobIds = activeJobs.map(j => j.data.jobId?.toString());
        if (activeJobIds.includes(id)) {
          console.log(`⚠️ Job ${id} is currently active and cannot be removed from queue`);
        }

      } catch (queueError) {
        console.error(`⚠️ Error removing job from queue: ${queueError}`);
        // Continue with database deletion even if queue removal fails
      }

      // Remove the job from MongoDB
      await JobModel.findByIdAndDelete(id);
      
      console.log(`✅ Job deleted: ${id} (${job.action})`);

      return {
        success: true,
        message: "Job deleted successfully",
        data: {
          id: job._id,
          action: job.action,
          status: job.status,
          deletedAt: new Date()
        }
      };

    } catch (error) {
      console.error("❌ Error deleting job:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to delete job",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

}
