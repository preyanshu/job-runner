import Fastify from "fastify";
import cors from "@fastify/cors";
import jobRoutes from "./routes/job";
import snapshotRoutes from "./routes/snapshots";
import { connectDB } from "./db/connect";
import { jobWorker, recoverOrphanedJobs } from "./queue/workers"; // start workers and import recovery

const server = Fastify({ logger: true });

const startServer = async () => {
  // Register plugins
  await server.register(cors, { origin: "*" });
  await server.register(jobRoutes); // Removed prefix: "/api"
  await server.register(snapshotRoutes);

  // Connect DB
  await connectDB();

  // Recover orphaned jobs from previous server shutdowns
  await recoverOrphanedJobs();

  // Start server
  try {
    await server.listen({ port: 3000, host: "0.0.0.0" });
    console.log("🚀 Fastify server running on http://localhost:3000");
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

startServer();
