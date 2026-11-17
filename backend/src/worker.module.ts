import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { validateEnv } from "./config/env.validation";
import { EdgeModule } from "./edge/edge.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PMS_QUEUE, SYSTEM_QUEUE } from "./queues/queue.constants";
import { PmsScheduleProcessor } from "./queues/pms-schedule.processor";
import { RedisModule } from "./redis/redis.module";
import { SystemProcessor } from "./queues/system.processor";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => ({
        ...config,
        ...validateEnv(config),
      }),
    }),
    PrismaModule,
    RedisModule,
    EdgeModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>("REDIS_URL") },
      }),
    }),
    BullModule.registerQueue({ name: SYSTEM_QUEUE }, { name: PMS_QUEUE }),
  ],
  providers: [SystemProcessor, PmsScheduleProcessor],
})
export class WorkerModule {}
