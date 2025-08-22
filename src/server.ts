import Fastify from "fastify";
import cors from "@fastify/cors";
import jobRoutes from "./routes/job";
import { connectDB } from "./db/connect";
import "./queue/workers"; // start workers

const server = Fastify({ logger: true });

const startServer = async () => {
  // Register plugins
  await server.register(cors, { origin: "*" });
  await server.register(jobRoutes, { prefix: "/api" });

  // Connect DB
  await connectDB();

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
