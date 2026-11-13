import { Injectable, Optional } from "@nestjs/common";
import { StorageService } from "../data/storage.service";
import { PrismaService } from "../prisma/prisma.service";

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: { status: "ok" | "error"; responseTime?: number; error?: string };
    storage: { status: "ok" | "error"; error?: string };
  };
  metrics?: { database_response_time?: number };
}

@Injectable()
export class HealthCheckService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storage?: StorageService,
  ) {}

  async run(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult["checks"] = {
      database: { status: "error" },
      storage: { status: "error" },
    };
    let status: HealthCheckResult["status"] = "healthy";

    const dbStart = Date.now();
    try {
      await this.prisma.establishments.findFirst({ select: { id: true } });
      checks.database = { status: "ok", responseTime: Date.now() - dbStart };
    } catch (error) {
      checks.database = { status: "error", error: messageOf(error) };
      status = "unhealthy";
    }

    try {
      if (!this.storage) throw new Error("storage down");
      await this.storage.ping();
      checks.storage = { status: "ok" };
    } catch (error) {
      checks.storage = { status: "error", error: messageOf(error) };
      if (status === "healthy") status = "degraded";
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      checks,
      metrics: { database_response_time: checks.database.responseTime },
    };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
