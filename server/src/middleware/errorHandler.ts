import type { FastifyInstance } from "fastify";
import { HttpError } from "../utils/httpError.js";
import type { Logger } from "../utils/logger.js";

export function registerErrorHandler(app: FastifyInstance, logger: Logger): void {
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof HttpError) {
      logger.warn({ msg: err.message, code: err.code, status: err.statusCode }, "HttpError");
      return reply.status(err.statusCode).send({
        error: err.message,
        code: err.code,
        details: err.details,
      });
    }
    const status =
      err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: unknown }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;
    const message = err instanceof Error ? err.message : "Internal Server Error";
    logger.error({ err }, "unhandled");
    return reply.status(status >= 400 && status < 600 ? status : 500).send({ error: message });
  });
}
