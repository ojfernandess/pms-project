import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { registerErrorHandler } from "./middleware/errorHandler.js";
import { registerRoutes } from "./routes/index.js";
import { createLogger, type Logger } from "./utils/logger.js";

export type BuildServerOptions = {
  env: Env;
  logger?: Logger;
};

export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const { env } = opts;
  const logger = opts.logger ?? createLogger(env.NODE_ENV);

  const app = Fastify({
    loggerInstance: logger,
    trustProxy: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN,
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "stripe-signature", "x-request-id"],
  });

  await registerRoutes(app, env, logger);

  app.setNotFoundHandler(async (_req, reply) => {
    await reply.status(404).send({ error: "Not Found" });
  });

  registerErrorHandler(app, logger);

  return app;
}
