import pino from "pino";
import type { FastifyBaseLogger } from "fastify";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function hasPinoPretty(): boolean {
  try {
    require.resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

export function createLogger(nodeEnv: string): FastifyBaseLogger {
  const isDev = nodeEnv === "development";
  const canPrettyPrint = isDev && hasPinoPretty();
  return pino({
    level: isDev ? "debug" : "info",
    transport: canPrettyPrint
      ? {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        }
      : undefined,
  }) as FastifyBaseLogger;
}

export type Logger = FastifyBaseLogger;
