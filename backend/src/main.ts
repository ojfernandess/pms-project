import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { RedisIoAdapter } from "./realtime/redis-io.adapter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  const config = app.get(ConfigService);
  const logger = new Logger("Bootstrap");

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  app.enableCors({ origin: true, credentials: true });

  const redisUrl = config.getOrThrow<string>("REDIS_URL");
  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connectToRedis(redisUrl);
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
