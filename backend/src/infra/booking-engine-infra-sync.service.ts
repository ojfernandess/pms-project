import { Injectable, Logger } from "@nestjs/common";
import { buildBookingEngineTraefikHostRule } from "../lib/booking-engine-traefik.util";
import { BookingEngineHostsService } from "../edge/booking-engine-hosts.service";
import { RedisService } from "../redis/redis.service";
import { BookingEngineCorsCacheService } from "./booking-engine-cors-cache.service";
import { DokployComposeClient, type DokploySaveResult } from "./dokploy-compose.client";

const REDIS_RULE_KEY = "pms:booking_engine:traefik_rule";
const REDIS_SYNC_AT = "pms:booking_engine:infra_sync:last_at";
const REDIS_SYNC_ERROR = "pms:booking_engine:infra_sync:last_error";

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
  }): Promise<BookingEngineInfraSyncResult> {
    const { rule, hosts, updates } = await this.buildDesiredTraefikEnv();
    await this.corsCache.refresh();

    if (!this.dokploy.isAutoSyncEnabled()) {
      return { ok: true, skipped: true, reason: "auto_sync_disabled", rule, hosts };
    }

    const lastRule = await this.redis.client.get(REDIS_RULE_KEY);
    if (lastRule === rule) {
      await this.redis.client.set(REDIS_SYNC_AT, new Date().toISOString());
      await this.redis.client.del(REDIS_SYNC_ERROR);
      return { ok: true, skipped: true, reason: "rule_unchanged", rule, hosts };
    }

    const result = await this.dokploy.applyEnvironmentVars(updates, { deploy: options?.deploy });
    if (result.ok && !result.skipped) {
      await this.redis.client.set(REDIS_RULE_KEY, rule);
      await this.redis.client.set(REDIS_SYNC_AT, new Date().toISOString());
      await this.redis.client.del(REDIS_SYNC_ERROR);
      this.logger.log(
        `Traefik motor sincronizado (${hosts.length} host(s)) reason=${options?.reason ?? "manual"} deploy=${result.deployed ?? false}`,
      );
    } else if (result.ok && result.reason === "env_unchanged") {
      await this.redis.client.set(REDIS_RULE_KEY, rule);
      await this.redis.client.set(REDIS_SYNC_AT, new Date().toISOString());
      await this.redis.client.del(REDIS_SYNC_ERROR);
    } else if (!result.ok && result.error) {
      await this.redis.client.set(REDIS_SYNC_ERROR, result.error);
    }

    return { ...result, rule, hosts };
  }

  async getLastSyncStatus(): Promise<{
    autoSyncEnabled: boolean;
    lastAt: string | null;
    lastError: string | null;
    lastRule: string | null;
  }> {
    const [lastAt, lastError, lastRule] = await Promise.all([
      this.redis.client.get(REDIS_SYNC_AT),
      this.redis.client.get(REDIS_SYNC_ERROR),
      this.redis.client.get(REDIS_RULE_KEY),
    ]);
    return {
      autoSyncEnabled: this.isAutoSyncEnabled(),
      lastAt,
      lastError,
      lastRule,
    };
  }
}