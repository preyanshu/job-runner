export const config = {
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/job-runner",
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379"
};
