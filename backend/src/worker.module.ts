import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { validateEnv } from "./config/env.validation";
import { EdgeModule } from "./edge/edge.module";
import { InfraModule } from "./infra/infra.module";
import { PrismaModule } from "./prisma/prisma.module";
import { CRM_QUEUE, PMS_QUEUE, RESERVATION_IMPORT_QUEUE, SYSTEM_QUEUE } from "./queues/queue.constants";
import { PmsScheduleProcessor } from "./queues/pms-schedule.processor";
import { RedisModule } from "./redis/redis.module";
import { SystemProcessor } from "./queues/system.processor";
import { AuthModule } from "./auth/auth.module";
import { CrmModule } from "./crm/crm.module";
import { CrmCampaignProcessor } from "./crm/crm-campaign.processor";
import { ReservationImportModule } from "./reservation-import/reservation-import.module";
import { ReservationImportProcessor } from "./reservation-import/reservation-import.processor";

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
    AuthModule,
    CrmModule,
    ReservationImportModule,
    EdgeModule,
    InfraModule,
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
  providers: [SystemProcessor, PmsScheduleProcessor, CrmCampaignProcessor, ReservationImportProcessor],
})
export class WorkerModule {}
