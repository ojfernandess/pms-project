import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parseDotenvBlock, serializeDotenvBlock, upsertDotenvVar } from "./parse-dotenv";

type ComposeOneResponse = {
  env?: string | null;
  composeId?: string;
  name?: string;
};

export type DokploySaveResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  deployed?: boolean;
  envChanged?: boolean;
};

@Injectable()
export class DokployComposeClient {
  private readonly logger = new Logger(DokployComposeClient.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.apiUrl() && this.apiKey() && this.composeId());
  }

  getComposeId(): string | null {
    return this.composeId();
  }

  isAutoSyncEnabled(): boolean {
    if (this.config.get<string>("BOOKING_ENGINE_INFRA_AUTO_SYNC") === "false") return false;
    return this.isConfigured();
  }

  shouldDeployAfterSave(): boolean {
    return this.config.get<string>("DOKPLOY_DEPLOY_ON_TRAEFIK_SYNC") !== "false";
  }

  async fetchEnvironment(): Promise<string> {
    const compose = await this.composeOne();
    return compose?.env ?? "";
  }

  async applyEnvironmentVars(
    updates: Record<string, string>,
    options?: { deploy?: boolean },
  ): Promise<DokploySaveResult> {
    if (!this.isConfigured()) {
      return { ok: false, skipped: true, reason: "dokploy_not_configured" };
    }
    try {
      const currentBlock = await this.fetchEnvironment();
      let nextBlock = currentBlock;
      let changed = false;
      const current = parseDotenvBlock(currentBlock);
      for (const [key, value] of Object.entries(updates)) {
        if (current.get(key) === value) continue;
        nextBlock = upsertDotenvVar(nextBlock, key, value);
        changed = true;
      }
      if (!changed) {
        return { ok: true, skipped: true, reason: "env_unchanged", envChanged: false };
      }
      await this.saveEnvironment(nextBlock);
      let deployed = false;
      if (options?.deploy !== false && this.shouldDeployAfterSave()) {
        await this.deploy();
        deployed = true;
      }
      return { ok: true, envChanged: true, deployed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Dokploy applyEnvironmentVars: ${message}`);
      return { ok: false, error: message };
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

  private composeId(): string | null {
    return this.config.get<string>("DOKPLOY_COMPOSE_ID")?.trim() || null;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey() ?? "",
    };
  }

  private async composeOne(): Promise<ComposeOneResponse | null> {
    const base = this.apiUrl();
    const composeId = this.composeId();
    if (!base || !composeId) return null;
    const url = `${base}/api/compose.one?composeId=${encodeURIComponent(composeId)}`;
    const res = await fetch(url, { method: "GET", headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`compose.one HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as ComposeOneResponse;
  }

  private async saveEnvironment(env: string): Promise<void> {
    const base = this.apiUrl();
    const composeId = this.composeId();
    if (!base || !composeId) throw new Error("Dokploy não configurado");
    const res = await fetch(`${base}/api/compose.saveEnvironment`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ composeId, env }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`compose.saveEnvironment HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  async deploy(): Promise<void> {
    const base = this.apiUrl();
    const composeId = this.composeId();
    if (!base || !composeId) throw new Error("Dokploy não configurado");
    const res = await fetch(`${base}/api/compose.deploy`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ composeId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`compose.deploy HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  /** Mescla vars sem redeploy (útil para testes). */
  previewMergedEnv(updates: Record<string, string>, currentBlock?: string): string {
    let block = currentBlock ?? "";
    const map = parseDotenvBlock(block);
    for (const [key, value] of Object.entries(updates)) map.set(key, value);
    return serializeDotenvBlock(map);
  }
}