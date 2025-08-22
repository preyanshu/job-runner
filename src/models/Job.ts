import mongoose from "mongoose";

const jobSchema = new mongoose.Schema({
  action: { type: String, required: true }, // e.g. "transfer", "mint", etc.
  payload: { type: Object, required: true },

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
  nextRunAt: { type: Date }  // computed for retries
}, { timestamps: true });

export const Job = mongoose.model("Job", jobSchema);
