import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { SchemaReadinessService } from "../prisma/schema-readiness.service";
import { RedisService } from "../redis/redis.service";
import { storageEnvDiagnostics } from "../data/storage-env";

export interface HealthReport {
  status: "ok" | "degraded";
  postgres: "ok";
  redis: "ok";
  timestamp: string;
  schema?: { ready: boolean; publicTables: number; hint?: string };
  storageEnv?: ReturnType<typeof storageEnvDiagnostics>;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly schema: SchemaReadinessService,
    private readonly config: ConfigService,
  ) {}

  async check(deep = false): Promise<HealthReport> {
    try {
      await this.prisma.ping();
      await this.redis.ping();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "dependency unavailable";
      throw new ServiceUnavailableException(detail);
    }

    const report: HealthReport = {
      status: "ok",
      postgres: "ok",
      redis: "ok",
      timestamp: new Date().toISOString(),
    };

    if (deep || !this.schema.schemaReady) {
      report.schema = {
        ready: this.schema.schemaReady,
        publicTables: this.schema.publicTableCount,
        ...(!this.schema.schemaReady
          ? {
              hint:
                "Restore pg_dump from Easypanel or apply supabase/migrations. PRISMA_MIGRATE_ON_START does not create full PMS schema.",
            }
          : {}),
      };
      if (!this.schema.schemaReady) report.status = "degraded";
    }

    if (deep) {
      report.storageEnv = storageEnvDiagnostics(this.config);
    }

    return report;
  }
}
