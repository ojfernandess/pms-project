import { Injectable } from "@nestjs/common";
import { normalizeHostname } from "../lib/hostname.util";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BookingEngineHostsService {
  private tableReady: boolean | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async assertTableReady(): Promise<boolean> {
    if (this.tableReady === true) return true;
    if (this.tableReady === false) return false;
    try {
      const rows = await this.prisma.$queryRaw<{ reg: string | null }[]>`
        SELECT to_regclass('public.platform_custom_domains')::text AS reg
      `;
      this.tableReady = Boolean(rows[0]?.reg);
    } catch {
      this.tableReady = false;
    }
    return this.tableReady;
  }

  async listHostnames(): Promise<string[]> {
    const hosts = new Set<string>();
    const companies = await this.prisma.companies.findMany({
      where: { booking_engine_enabled: true, booking_engine_custom_domain: { not: null } },
      select: { booking_engine_custom_domain: true },
    });
    for (const row of companies) {
      const h = normalizeHostname(row.booking_engine_custom_domain ?? "");
      if (h) hosts.add(h);
    }
    if (await this.assertTableReady()) {
      const rows = await this.prisma.platform_custom_domains.findMany({
        where: { service_type: "booking_engine", status: { not: "suspended" } },
        select: { hostname: true },
      });
      for (const row of rows) {
        const h = normalizeHostname(row.hostname);
        if (h) hosts.add(h);
      }
    }
    return [...hosts];
  }
}