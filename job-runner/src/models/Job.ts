import mongoose from "mongoose";

const jobSchema = new mongoose.Schema({

  action: { type: String, required: true }, // e.g. "transfer", "mint", etc.
  payload: { type: Object, required: true },
  
  network: { 
    type: String, 
    enum: ["testnet", "devnet", "mainnet"], 
    default: "testnet",
    required: true
  }, // Network for job execution

  type: { 
    type: String, 
    enum: ["scheduled", "retry"], 
    required: true 
  }, // scheduled -> runs once, retry -> runs repeatedly

  scheduledAt: { type: Date }, // only required for scheduled jobs
  intervalMinutes: { type: Number }, // only for retry jobs (cron-like)

  status: { 
    type: String, 
    enum: ["pending", "running", "completed", "failed"], 
    default: "pending" 
  },

  lastRunAt: { type: Date }, // useful for retry jobs
  nextRunAt: { Date },  // computed for retries
  
  // Execution logs and error tracking
  logs: [{
    timestamp: { type: Date, default: Date.now },
    level: { type: String, enum: ['INFO', 'WARN', 'ERROR'], default: 'INFO' },
    message: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed }, // Additional error details, stack traces, etc.
    function: { type: String }, // Which function was called
    duration: { type: Number }, // Execution time in milliseconds
    source: { type: String, enum: ['job_execution', 'service_function'], default: 'job_execution' } // Where the log came from
  }],

  // Service function logs (separated for easier access)
  serviceLogs: {
    type: [{
      timestamp: { type: Date, default: Date.now },
      level: { type: String, enum: ['INFO', 'WARN', 'ERROR'], default: 'INFO' },
      message: { type: String, required: true },
      function: { type: String }, // Which service function (createWalletSnapshot, analyzeCoinFlows, etc.)
      details: { type: mongoose.Schema.Types.Mixed }, // Additional context, error details, etc.
      duration: { type: Number } // Execution time in milliseconds
    }],
    default: [] // Default to empty array
  },

  // Error details for failed jobs
  errorDetails: {
    message: String,
    stack: String,
    function: String,
    timestamp: Date
  }
}, { timestamps: true });

export const Job = mongoose.model("Job", jobSchema);
