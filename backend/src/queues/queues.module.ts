import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CRM_QUEUE, PMS_QUEUE, RESERVATION_IMPORT_QUEUE, SYSTEM_QUEUE } from "./queue.constants";
import { InfraSyncQueueService } from "./infra-sync-queue.service";
import { SystemQueueController } from "./system-queue.controller";
import { SystemQueueService } from "./system-queue.service";

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("REDIS_URL") },
      }),
    }),
    BullModule.registerQueue(
      { name: SYSTEM_QUEUE },
      { name: PMS_QUEUE },
      { name: CRM_QUEUE },
      { name: RESERVATION_IMPORT_QUEUE },
    ),
  ],
  controllers: [SystemQueueController],
  providers: [SystemQueueService, InfraSyncQueueService],
  exports: [SystemQueueService, InfraSyncQueueService, BullModule],
})
export class QueuesModule {}
