import "./utils/loadEnv.js";
import { loadEnv } from "./config/env.js";
import { createLogger } from "./utils/logger.js";
import { buildServer } from "./server.js";

const env = loadEnv();
const logger = createLogger(env.NODE_ENV);
const app = await buildServer({ env, logger });

await app.listen({ port: env.PORT, host: "0.0.0.0" });
logger.info({ port: env.PORT }, "API a escutar");
