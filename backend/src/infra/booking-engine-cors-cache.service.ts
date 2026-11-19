import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BookingEngineHostsService } from "../edge/booking-engine-hosts.service";
import { bookingEngineHostnamesToCorsOrigins } from "../lib/booking-engine-traefik.util";

@Injectable()
export class BookingEngineCorsCacheService implements OnModuleInit {
  private readonly logger = new Logger(BookingEngineCorsCacheService.name);
  private origins = new Set<string>();
  private refreshedAt = 0;
  private refreshInFlight: Promise<void> | null = null;

  constructor(
    private readonly hosts: BookingEngineHostsService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled()) return;
    await this.refresh().catch((error) => {
      this.logger.warn(`CORS cache inicial: ${error instanceof Error ? error.message : error}`);
    });
  }

  enabled(): boolean {
    if (this.config.get<string>("BOOKING_ENGINE_CORS_FROM_DB") === "false") return false;
    return true;
  }

  isAllowedOrigin(origin: string): boolean {
    if (!this.enabled() || !origin?.trim()) return false;
    const normalized = origin.trim();
    if (this.origins.has(normalized)) return true;
    if (Date.now() - this.refreshedAt > 60_000) {
      void this.refresh();
    }
    return this.origins.has(normalized);
  }

  async refresh(): Promise<void> {
    if (!this.enabled()) return;
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.doRefresh();
    try {
      await this.refreshInFlight;
    } finally {
      this.refreshInFlight = null;
    }
  }

  private async doRefresh(): Promise<void> {
    const hosts = await this.hosts.listHostnames();
    this.origins = new Set(bookingEngineHostnamesToCorsOrigins(hosts));
    this.refreshedAt = Date.now();
  }
}