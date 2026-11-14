import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";

async function bootstrap() {
  // Stdout imediato (antes do Nest) — visível no Easypanel mesmo com bufferLogs.
  console.log("[Worker] bootstrapping BullMQ...");
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });
  app.enableShutdownHooks();
  new Logger("Worker").log("BullMQ worker running — jobs: send-daily-digest, send-checkout-reminders");
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("Worker");
  logger.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
