import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { describeDatabaseUrlTarget, normalizePooledDatabaseUrl, sanitizeDatabaseUrlValue } from "./database-url";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = process.env.DATABASE_URL ? normalizePooledDatabaseUrl(process.env.DATABASE_URL) : undefined;
    super(url ? { datasources: { db: { url } } } : undefined);
  }

  async onModuleInit(): Promise<void> {
    const maxAttempts = Number(process.env.PRISMA_CONNECT_RETRIES ?? 10);
    const baseDelayMs = Number(process.env.PRISMA_CONNECT_RETRY_MS ?? 1500);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        await this.ping();
        this.logger.log("PostgreSQL connected");
        return;
        this.logger.log(
          `PostgreSQL connected (${describeDatabaseUrlTarget(process.env.DATABASE_URL ?? "")})`,
        );
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`PostgreSQL connect ${attempt}/${maxAttempts}: ${message}`);
        if (attempt === maxAttempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(baseDelayMs * attempt, 15_000)));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
