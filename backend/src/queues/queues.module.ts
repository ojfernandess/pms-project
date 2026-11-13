import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SYSTEM_QUEUE } from "./queue.constants";
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
    BullModule.registerQueue({ name: SYSTEM_QUEUE }),
  ],
  controllers: [SystemQueueController],
  providers: [SystemQueueService],
  exports: [SystemQueueService],
})
export class QueuesModule {}
