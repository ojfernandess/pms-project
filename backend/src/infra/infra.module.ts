import { Module } from "@nestjs/common";
import { BookingEngineHostsService } from "../edge/booking-engine-hosts.service";
import { PrismaModule } from "../prisma/prisma.module";
import { RedisModule } from "../redis/redis.module";
import { BookingEngineCorsCacheService } from "./booking-engine-cors-cache.service";
import { BookingEngineInfraSyncService } from "./booking-engine-infra-sync.service";
import { DokployComposeClient } from "./dokploy-compose.client";
import { DokployDomainClient } from "./dokploy-domain.client";

@Module({
  imports: [PrismaModule, RedisModule],
  providers: [
    BookingEngineHostsService,
    DokployComposeClient,
    DokployDomainClient,
    BookingEngineCorsCacheService,
    BookingEngineInfraSyncService,
  ],
  exports: [
    BookingEngineHostsService,
    DokployComposeClient,
    DokployDomainClient,
    BookingEngineCorsCacheService,
    BookingEngineInfraSyncService,
  ],
})
export class InfraModule {}