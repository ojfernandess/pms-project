import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { DataModule } from "./data/data.module";
import { EdgeModule } from "./edge/edge.module";
import { HealthModule } from "./health/health.module";
import { PmsModule } from "./pms/pms.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueuesModule } from "./queues/queues.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { RedisModule } from "./redis/redis.module";
import { validateEnv } from "./config/env.validation";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    DataModule,
    PmsModule,
    EdgeModule,
    QueuesModule,
    RealtimeModule,
    HealthModule,
  ],
})
export class AppModule {}
