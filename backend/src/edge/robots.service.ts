import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  return host.split(":")[0].toLowerCase().trim();
}

export function renderRobots(input: {
  baseUrl: string;
  robotsTxt: string | null;
}): string {
  if (input.robotsTxt && input.robotsTxt.trim() !== "") return input.robotsTxt.trim();
  const sitemapUrl = `${input.baseUrl.replace(/\/$/, "")}/sitemap.xml`;
  return `User-agent: *
Allow: /
Disallow: /admin-dashboard
Disallow: /super-admin
Disallow: /:establishmentId/

Sitemap: ${sitemapUrl}
`;
}

@Injectable()
export class RobotsService {
  constructor(private readonly prisma: PrismaService) {}

  async render(input: { host?: string | null; domain?: string | null; company?: string | null; origin?: string | null }): Promise<string> {
    const site = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { robots_txt: true, pms_base_url: true },
    });
    let baseUrl = (site?.pms_base_url || input.origin || "https://example.com").replace(/\/$/, "");
    let robotsTxt = site?.robots_txt?.trim() || null;
    const matchHost = normalizeHost(input.host) || (input.domain || "").trim().toLowerCase();

    let company: { robots_txt: string | null; seo_base_url: string | null } | null = null;
    if (matchHost) {
      const rows = await this.prisma.companies.findMany({
        where: { is_active: true, seo_custom_domain: { not: null } },
        select: { robots_txt: true, seo_base_url: true, seo_custom_domain: true },
      });
      company = rows.find((row) => normalizeHost(row.seo_custom_domain) === matchHost) ?? null;
    }
    if (!company && input.company) {
      company = await this.prisma.companies.findFirst({
        where: { booking_engine_slug: input.company.trim(), is_active: true },
        select: { robots_txt: true, seo_base_url: true },
      });
    }
    if (company?.seo_base_url?.trim()) baseUrl = company.seo_base_url.replace(/\/$/, "");
    if (company?.robots_txt?.trim()) robotsTxt = company.robots_txt.trim();
    return renderRobots({ baseUrl, robotsTxt });
  }
}
