import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Injectable()
export class SchemaReadinessService implements OnModuleInit {
  private readonly logger = new Logger(SchemaReadinessService.name);
  /** false quando public.companies (e resto do PMS) ainda nao existe — ex. Postgres novo no Dokploy. */
  schemaReady = false;
  publicTableCount = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.prisma.$queryRaw<
        { companies: string | null; table_count: bigint | number }[]
      >`
        SELECT to_regclass('public.companies')::text AS companies,
               (SELECT count(*) FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS table_count
      `;
      const row = rows[0];
      this.publicTableCount = Number(row?.table_count ?? 0);
      this.schemaReady = Boolean(row?.companies);
      if (!this.schemaReady) {
        this.logger.error(
          `Schema PMS incompleto (${this.publicTableCount} tabelas em public; falta companies/site_settings). ` +
            "Restaure pg_dump do Easypanel ou aplique migracoes SQL. " +
            "PRISMA_MIGRATE_ON_START nao cria o schema completo do PMS.",
        );
        return;
      }
      this.logger.log(`Schema PMS validado (public.companies presente; ${this.publicTableCount} tabelas).`);
      await this.applyIncrementalSiteSettingsColumns();
      await this.applyPlatformCustomDomainsTable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Validacao de schema falhou: ${message}`);
    }
  }

  /** DDL idempotente para colunas novas em site_settings (Data API valida information_schema). */
  private async applyIncrementalSiteSettingsColumns(): Promise<void> {
    if (!this.schemaReady) return;
    try {
      await this.prisma.$executeRawUnsafe(`
        ALTER TABLE public.site_settings
        ADD COLUMN IF NOT EXISTS web_checkin_public_base_url TEXT
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não foi possível garantir coluna site_settings.web_checkin_public_base_url: ${message}`);
    }
  }

  private async applyPlatformCustomDomainsTable(): Promise<void> {
    if (!this.schemaReady) return;
    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS public.platform_custom_domains (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          hostname TEXT NOT NULL,
          company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
          service_type TEXT NOT NULL DEFAULT 'web_checkin',
          status TEXT NOT NULL DEFAULT 'pending_dns',
          verification_token TEXT NOT NULL,
          ownership_verified_at TIMESTAMPTZ,
          dns_last_checked_at TIMESTAMPTZ,
          dns_status TEXT,
          ssl_status TEXT,
          ssl_expires_at TIMESTAMPTZ,
          last_error TEXT,
          infra_cname_target TEXT,
          infra_a_target TEXT,
          verification_history JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT platform_custom_domains_hostname_unique UNIQUE (hostname)
        )
      `);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não foi possível garantir tabela platform_custom_domains: ${message}`);
    }
  }
}