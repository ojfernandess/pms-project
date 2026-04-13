import pino from "pino";
import type { FastifyBaseLogger } from "fastify";

export function createLogger(nodeEnv: string): FastifyBaseLogger {
  const isDev = nodeEnv === "development";
  return pino({
    level: isDev ? "debug" : "info",
    transport: isDev
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
  }) as FastifyBaseLogger;
}

export type Logger = FastifyBaseLogger;
