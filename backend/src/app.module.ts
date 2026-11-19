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
import { SocketRedisAdapterShutdown } from "./realtime/redis-adapter.shutdown";
import { RedisModule } from "./redis/redis.module";
import { validateEnv } from "./config/env.validation";
import { InfraModule } from "./infra/infra.module";

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
    DataModule,
    PmsModule,
    EdgeModule,
    QueuesModule,
    RealtimeModule,
    HealthModule,
    InfraModule,
  ],
  providers: [SocketRedisAdapterShutdown],
})
export class AppModule {}
