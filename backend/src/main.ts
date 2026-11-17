import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { json, raw } from "express";
import type { Request, Response, NextFunction } from "express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { buildCorsOptions } from "./config/cors-options";
import { registerSocketRedisAdapter } from "./realtime/redis-adapter.shutdown";
import { RedisIoAdapter } from "./realtime/redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true, bodyParser: false });
  const config = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  const http = app.getHttpAdapter().getInstance();
  const webhookRawPaths = new Set([
    "/functions/v1/stripe-webhook",
    "/functions/v1/channex-reservation-webhook",
    "/functions/v1/aiosell-reservation-webhook",
  ]);
  const needsRawBody = (req: Request) => {
    if (req.method !== "POST" && req.method !== "PUT") return false;
    if (webhookRawPaths.has(req.path)) return true;
    return /^\/storage\/v1\/object\/(?!public\/|sign\/|sign-get\/)/.test(req.path);
  };
  http.use((req: Request, res: Response, next: NextFunction) => {
    if (needsRawBody(req)) {
      return raw({ type: () => true, limit: "20mb" })(req, res, (err?: unknown) => {
        if (err) return next(err);
        if (Buffer.isBuffer(req.body)) {
          (req as Request & { rawBody?: Buffer }).rawBody = req.body;
        }
        next();
      });
    }
    return json({ limit: "10mb" })(req, res, next);
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  app.enableCors(buildCorsOptions(config));

  const redisUrl = config.getOrThrow<string>("REDIS_URL");
  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connectToRedis(redisUrl);
  registerSocketRedisAdapter(redisAdapter);
  app.useWebSocketAdapter(redisAdapter);

  const port = Number(config.get("PORT") ?? 3000);
  await app.listen(port, "0.0.0.0");
  logger.log(`API listening on :${port}`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("Bootstrap");
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
