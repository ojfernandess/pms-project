import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.enableShutdownHooks();
  new Logger("Worker").log("BullMQ worker running");
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("Worker");
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
