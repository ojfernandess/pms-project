import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== "http") {
      this.logger.error(this.describe(exception));
      return;
    }

    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof body === "string"
        ? body
        : body && typeof body === "object" && "message" in body
          ? (body as { message: string | string[] }).message
          : "Internal server error";

    if (status >= 500) {
      this.logger.error(this.describe(exception));
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private describe(exception: unknown): string {
    return exception instanceof Error ? (exception.stack ?? exception.message) : String(exception);
  }
}
