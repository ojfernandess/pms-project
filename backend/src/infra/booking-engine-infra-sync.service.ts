import { Injectable, Logger } from "@nestjs/common";
import { buildBookingEngineTraefikHostRule } from "../lib/booking-engine-traefik.util";
import { BookingEngineHostsService } from "../edge/booking-engine-hosts.service";
import { RedisService } from "../redis/redis.service";
import { BookingEngineCorsCacheService } from "./booking-engine-cors-cache.service";
import { DokployComposeClient, type DokploySaveResult } from "./dokploy-compose.client";

const REDIS_RULE_KEY = "pms:booking_engine:traefik_rule";
const REDIS_SYNC_AT = "pms:booking_engine:infra_sync:last_at";
const REDIS_SYNC_ERROR = "pms:booking_engine:infra_sync:last_error";
const REDIS_SYNC_RESULT = "pms:booking_engine:infra_sync:last_result";
const REDIS_DEPLOY_AT = "pms:booking_engine:infra_sync:last_deploy_at";
const REDIS_VERIFY_SYNC_COOLDOWN = "pms:booking_engine:infra_sync:verify_cooldown";

export type BookingEngineInfraSyncResult = DokploySaveResult & {
  rule?: string;
  hosts?: string[];
};

@Injectable()
export class BookingEngineInfraSyncService {
  private readonly logger = new Logger(BookingEngineInfraSyncService.name);

  constructor(
    private readonly dokploy: DokployComposeClient,
    private readonly hosts: BookingEngineHostsService,
    private readonly redis: RedisService,
    private readonly corsCache: BookingEngineCorsCacheService,
  ) {}

  isAutoSyncEnabled(): boolean {
    return this.dokploy.isAutoSyncEnabled();
  }

  /** Evita compose.deploy a cada poll de verificação (30s) na UI. */
  async allowInfraSyncOnVerify(): Promise<boolean> {
    const ttlSec = Number(process.env.BOOKING_ENGINE_VERIFY_SYNC_COOLDOWN_SEC ?? 900);
    const hit = await this.redis.client.get(REDIS_VERIFY_SYNC_COOLDOWN);
    if (hit) return false;
    await this.redis.client.set(REDIS_VERIFY_SYNC_COOLDOWN, new Date().toISOString(), "EX", ttlSec);
    return true;
  }

  async buildDesiredTraefikEnv(): Promise<{ rule: string; hosts: string[]; updates: Record<string, string> }> {
    const hosts = await this.hosts.listHostnames();
    const rule = buildBookingEngineTraefikHostRule(hosts);
    const updates: Record<string, string> = {
      BOOKING_ENGINE_TRAEFIK_RULE: rule,
      BOOKING_ENGINE_PUBLIC_HOSTS: hosts.length ? hosts.join(",") : "",
    };
    return { rule, hosts, updates };
  }

  async syncBookingEngineTraefik(options?: {
    deploy?: boolean;
    reason?: string;
    forceRedeploy?: boolean;
  }): Promise<BookingEngineInfraSyncResult> {
    const reason = options?.reason ?? "manual";
    const scheduled = reason === "schedule";
    const forceRedeploy =
      options?.forceRedeploy === true ||
      reason === "ensure" ||
      reason === "verify" ||
      reason === "super_admin" ||
      reason === "clear";

    const { rule, hosts, updates } = await this.buildDesiredTraefikEnv();
    await this.corsCache.refresh();

    if (!this.dokploy.isAutoSyncEnabled()) {
      return { ok: true, skipped: true, reason: "auto_sync_disabled", rule, hosts };
    }

    const lastRule = await this.redis.client.get(REDIS_RULE_KEY);
    if (lastRule === rule && scheduled && !forceRedeploy) {
      await this.touchSyncOk(rule, "rule_unchanged");
      return { ok: true, skipped: true, reason: "rule_unchanged", rule, hosts };
    }

    let result: DokploySaveResult = { ok: true, skipped: true, reason: "noop" };
    const envAlreadySynced = lastRule === rule;
    if (!envAlreadySynced || !forceRedeploy) {
      result = await this.dokploy.applyEnvironmentVars(updates, { deploy: false });
    } else {
      result = { ok: true, skipped: true, reason: "env_unchanged", envChanged: false };
    }

    const wantDeploy =
      options?.deploy !== false &&
      this.dokploy.shouldDeployAfterSave() &&
      (forceRedeploy || result.envChanged === true);

    if (result.ok && wantDeploy) {
      try {
        await this.dokploy.deploy();
        result = { ...result, ok: true, deployed: true };
        await this.redis.client.set(REDIS_DEPLOY_AT, new Date().toISOString());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result = { ok: false, error: `compose.deploy: ${message}`, envChanged: result.envChanged };
      }
    }

    if (result.ok) {
      await this.redis.client.set(REDIS_RULE_KEY, rule);
      await this.touchSyncOk(rule, result.reason ?? (result.deployed ? "deployed" : "synced"));
      this.logger.log(
        `Traefik motor sync reason=${reason} hosts=${hosts.length} envChanged=${result.envChanged ?? false} deployed=${result.deployed ?? false}`,
      );
    } else if (result.error) {
      await this.redis.client.set(REDIS_SYNC_ERROR, result.error);
      await this.redis.client.set(
        REDIS_SYNC_RESULT,
        JSON.stringify({ at: new Date().toISOString(), reason, error: result.error }),
      );
    }

    return { ...result, rule, hosts };
  }

  private async touchSyncOk(rule: string, resultLabel: string) {
    await this.redis.client.set(REDIS_RULE_KEY, rule);
    await this.redis.client.set(REDIS_SYNC_AT, new Date().toISOString());
    await this.redis.client.del(REDIS_SYNC_ERROR);
    await this.redis.client.set(
      REDIS_SYNC_RESULT,
      JSON.stringify({ at: new Date().toISOString(), result: resultLabel }),
    );
  }

  async getLastSyncStatus(): Promise<{
    autoSyncEnabled: boolean;
    dokployConfigured: boolean;
    lastAt: string | null;
    lastDeployAt: string | null;
    lastError: string | null;
    lastRule: string | null;
    lastResult: string | null;
  }> {
    const [lastAt, lastDeployAt, lastError, lastRule, lastResult] = await Promise.all([
      this.redis.client.get(REDIS_SYNC_AT),
      this.redis.client.get(REDIS_DEPLOY_AT),
      this.redis.client.get(REDIS_SYNC_ERROR),
      this.redis.client.get(REDIS_RULE_KEY),
      this.redis.client.get(REDIS_SYNC_RESULT),
    ]);
    return {
      autoSyncEnabled: this.isAutoSyncEnabled(),
      dokployConfigured: this.dokploy.isConfigured(),
      lastAt,
      lastDeployAt,
      lastError,
      lastRule,
      lastResult,
    };
  }
}