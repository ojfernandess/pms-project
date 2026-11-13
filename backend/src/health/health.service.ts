import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

export interface HealthReport {
  status: "ok";
  postgres: "ok";
  redis: "ok";
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    try {
      await this.prisma.ping();
      await this.redis.ping();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "dependency unavailable";
      throw new ServiceUnavailableException(detail);
    }

    return {
      status: "ok",
      postgres: "ok",
      redis: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
