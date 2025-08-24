import { Worker } from "bullmq";
import { config } from "../config";
import IORedis from "ioredis";
import { Job as JobModel } from "../models/Job";
import { jobQueue } from "../queue/jobQueue";
// Import the service functions
import { createWalletSnapshot } from "../services/run";
import { analyzeCoinFlows } from "../services/token";
import { analyzeNFTMovements } from "../services/nft";

const connection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const jobWorker = new Worker(
  "jobs",
  async (job) => {
    console.log("⚡ Running job:", job.id, job.data);

    const { jobId, action, type, scheduledAt, intervalMinutes, payload, network } = job.data;
    const startTime = Date.now();

    try {
      // Log job start
      await JobModel.findByIdAndUpdate(jobId, {
        status: "running",
        $push: {
          logs: {
            timestamp: new Date(),
            level: 'INFO',
            message: `Job execution started`,
            function: action,
            details: { payload, type }
          }
        }
      });

      if (type === "scheduled") {
        if (scheduledAt && new Date(scheduledAt) > new Date()) {
          console.log("⏳ Scheduled time not reached yet, skipping job:", jobId);
          
          await JobModel.findByIdAndUpdate(jobId, {
            $push: {
              logs: {
                timestamp: new Date(),
                level: 'WARN',
                message: 'Scheduled time not reached yet, skipping job',
                function: action,
                details: { scheduledAt, currentTime: new Date() }
              }
            }
          });
          return;
        }

        console.log("✅ Running scheduled job:", jobId);
        const { result, capturedLogs } = await runTask(action, payload, { network });

        const duration = Date.now() - startTime;
        await JobModel.findByIdAndUpdate(jobId, { 
          status: "completed", 
          lastRunAt: new Date(),
          $push: {
            logs: {
              timestamp: new Date(),
              level: 'INFO',
              message: 'Job completed successfully',
              function: action,
              duration,
              source: 'job_execution'
            },
            serviceLogs: { $each: capturedLogs }
          }
        });
      } 
      else if (type === "retry") {
        console.log("🔄 Running recurring/retry job:", jobId);

        const { result, capturedLogs } = await runTask(action, payload, { network });

        const nextRun = new Date(Date.now() + intervalMinutes * 60 * 1000);
        const duration = Date.now() - startTime;
        
        await JobModel.findByIdAndUpdate(jobId, { 
          lastRunAt: new Date(), 
          nextRunAt: nextRun,
          $push: {
            logs: {
              timestamp: new Date(),
              level: 'INFO',
              message: 'Recurring job completed, scheduling next run',
              function: action,
              duration,
              details: { nextRun, intervalMinutes },
              source: 'job_execution'
            },
            serviceLogs: { $each: capturedLogs }
          }
        });

        // Use the **queue instance directly** to re-add job
        await jobQueue.add(
          "jobs",
          { jobId, action, type, intervalMinutes, payload },
          { delay: intervalMinutes * 60 * 1000 }
        );
      } 
      else {
        console.warn("⚠️ Unknown job type:", type);
        
        await JobModel.findByIdAndUpdate(jobId, {
          $push: {
            logs: {
              timestamp: new Date(),
              level: 'WARN',
              message: 'Unknown job type encountered',
              function: action,
              details: { type }
            }
          }
        });
      }
    } catch (err) {
      console.error("❌ Job failed:", jobId, err);
      const duration = Date.now() - startTime;
      
      await JobModel.findByIdAndUpdate(jobId, { 
        status: "failed", 
        error: String(err),
        errorDetails: {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          function: action,
          timestamp: new Date()
        },
        $push: {
          logs: {
            timestamp: new Date(),
            level: 'ERROR',
            message: 'Job execution failed',
            function: action,
            duration,
            details: {
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined
            }
          }
        }
      });
    }
  },
  { connection }
);

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await jobWorker.close();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await jobWorker.close();
  await connection.quit();
  process.exit(0);
});

// Job recovery on startup
export async function recoverOrphanedJobs() {
  console.log('🔄 Recovering orphaned jobs...');
  
  try {
    // Find all pending recurring jobs
    const orphanedJobs = await JobModel.find({
      type: 'retry',
      status: 'pending',
      $or: [
        { lastRunAt: { $exists: false } },
        { lastRunAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } // Older than 24 hours
      ]
    });

    console.log(`📊 Found ${orphanedJobs.length} orphaned jobs to recover`);

    for (const job of orphanedJobs) {
      const jobData = {
        jobId: job._id,
        action: job.action,
        payload: job.payload,
        type: job.type,
        intervalMinutes: job.intervalMinutes
      };

      // Re-add to queue
      await jobQueue.add("jobs", jobData);
      console.log(`✅ Recovered job: ${job._id} (${job.action})`);
    }

    console.log('🎉 Job recovery completed');
  } catch (error) {
    console.error('❌ Error during job recovery:', error);
  }
}

async function runTask(action: string, payload: any, jobData: any = {}) {
  console.log("🏗️ Running task with action:", action, "and payload:", payload);
  const startTime = Date.now();
  
  // Capture console.log output from service functions
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  const capturedLogs: any[] = [];
  
  // Override console methods to capture logs
  console.log = (...args) => {
    originalConsoleLog(...args);
    capturedLogs.push({
      timestamp: new Date(),
      level: 'INFO',
      message: args.join(' '),
      function: action
    });
  };
  
  console.error = (...args) => {
    originalConsoleError(...args);
    capturedLogs.push({
      timestamp: new Date(),
      level: 'ERROR',
      message: args.join(' '),
      function: action
    });
  };
  
  console.warn = (...args) => {
    originalConsoleWarn(...args);
    capturedLogs.push({
      timestamp: new Date(),
      level: 'WARN',
      message: args.join(' '),
      function: action
    });
  };
  
  try {
    let result;
    
    switch (action) {
      case "wallet_snapshot":
        console.log("📊 Creating wallet snapshot for:", payload.wallet);
        result = await createWalletSnapshot(payload.wallet);
        break;
        
      case "analyze_coin_flows":
        console.log("🪙 Analyzing coin flows for token:", payload.tokenAddress);
        result = await analyzeCoinFlows(
          {
            address: payload.tokenAddress,
            name: payload.tokenName || 'Unknown Token',
            symbol: payload.tokenSymbol || 'UNK',
            thresholds: {
              largeTransfer: payload.options?.largeTransfer || 1000000,
              whalePercentage: payload.options?.whalePercentage || 10,
              volumeSpike: payload.options?.volumeSpike || 200
            },
            watchedAddresses: payload.options?.watchedAddresses || []
          }, 
          jobData.network || 'testnet', 
          payload.options
        );
        break;
        
      case "analyze_nft_movements":
        console.log("🖼️ Analyzing NFT movements for collection:", payload.tokenAddress);
        result = await analyzeNFTMovements(
          {
            address: payload.tokenAddress,
            name: payload.collectionName || 'Unknown Collection',
            symbol: payload.collectionSymbol || 'UNK',
            thresholds: {
              massTransferCount: payload.options?.massTransfer || 50,
              whaleTokenCount: payload.options?.whaleAccumulation || 100,
              suspiciousMintRate: payload.options?.suspiciousMintRate || 10,
              highActivitySpike: payload.options?.highActivitySpike || 200
            },
            watchedAddresses: payload.options?.watchedAddresses || []
          }, 
          jobData.network || 'testnet', 
          payload.options
        );
        break;
        
      default:
        console.warn("⚠️ Unknown action type:", action);
        throw new Error(`Unknown action type: ${action}`);
    }
    
    const duration = Date.now() - startTime;
    console.log("✅ Task completed successfully for action:", action, "in", duration, "ms");
    
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    
    return { result, capturedLogs };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("❌ Task failed for action:", action, "after", duration, "ms", error);
    
    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    
    // Log detailed error information
    const errorDetails = {
      action,
      payload,
      duration,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date()
    };
    
    console.error("🔍 Detailed error info:", JSON.stringify(errorDetails, null, 2));
    throw error;
  }
}
