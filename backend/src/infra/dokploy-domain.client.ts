import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { normalizeHostname } from "../lib/hostname.util";
import { DokployComposeClient } from "./dokploy-compose.client";

type DokployDomainRow = {
  domainId?: string;
  host?: string;
  serviceName?: string | null;
  https?: boolean;
  certificateType?: string | null;
};

@Injectable()
export class DokployDomainClient {
  private readonly logger = new Logger(DokployDomainClient.name);

  constructor(
    private readonly config: ConfigService,
    private readonly compose: DokployComposeClient,
  ) {}

  isEnabled(): boolean {
    if (this.config.get<string>("DOKPLOY_SYNC_DOMAINS") === "false") return false;
    return this.compose.isConfigured();
  }

  frontendServiceName(): string {
    return this.config.get<string>("DOKPLOY_FRONTEND_SERVICE_NAME")?.trim() || "frontend";
  }

  async listComposeDomains(): Promise<DokployDomainRow[]> {
    const composeId = this.compose.getComposeId();
    if (!composeId) return [];
    const base = this.apiUrl();
    const key = this.apiKey();
    if (!base || !key) return [];
    const url = `${base}/api/domain.byComposeId?composeId=${encodeURIComponent(composeId)}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`domain.byComposeId HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const payload = (await res.json()) as DokployDomainRow[] | { domains?: DokployDomainRow[] };
    if (Array.isArray(payload)) return payload;
    return payload.domains ?? [];
  }

  async ensureBookingEngineDomains(hosts: string[]): Promise<{
    ok: boolean;
    created: string[];
    existing: string[];
    error?: string;
  }> {
    if (!this.isEnabled()) {
      return { ok: true, created: [], existing: [] };
    }
    const composeId = this.config.get<string>("DOKPLOY_COMPOSE_ID")?.trim();
    if (!composeId) return { ok: false, created: [], existing: [], error: "DOKPLOY_COMPOSE_ID ausente" };

    try {
      const current = await this.listComposeDomains();
      const byHost = new Set(
        current.map((row) => normalizeHostname(row.host ?? "")).filter(Boolean),
      );
      const created: string[] = [];
      const existing: string[] = [];
      const serviceName = this.frontendServiceName();

      for (const raw of hosts) {
        const host = normalizeHostname(raw);
        if (!host) continue;
        if (byHost.has(host)) {
          existing.push(host);
          continue;
        }
        await this.createComposeDomain({ host, composeId, serviceName });
        byHost.add(host);
        created.push(host);
        this.logger.log(`Dokploy domain.create host=${host} service=${serviceName}`);
      }

      return { ok: true, created, existing };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`ensureBookingEngineDomains: ${message}`);
      return { ok: false, created: [], existing: [], error: message };
    }
  }

  private async createComposeDomain(args: {
    host: string;
    composeId: string;
    serviceName: string;
  }): Promise<void> {
    const base = this.apiUrl();
    if (!base) throw new Error("DOKPLOY_API_URL ausente");
    const res = await fetch(`${base}/api/domain.create`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        host: args.host,
        composeId: args.composeId,
        serviceName: args.serviceName,
        port: 80,
        https: true,
        certificateType: "letsencrypt",
        domainType: "compose",
        path: "/",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`domain.create HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
  }

  private apiUrl(): string | null {
    const raw =
      this.config.get<string>("DOKPLOY_API_URL")?.trim() ||
      this.config.get<string>("DOKPLOY_URL")?.trim();
    if (!raw) return null;
    return raw.replace(/\/$/, "");
  }

  private apiKey(): string | null {
    return this.config.get<string>("DOKPLOY_API_KEY")?.trim() || null;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey() ?? "",
    };
  }
}