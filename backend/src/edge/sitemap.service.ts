import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeHost, SITE_SETTINGS_ID } from "./robots.service";

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

@Injectable()
export class SitemapService {
  constructor(private readonly prisma: PrismaService) {}

  async render(input: { host?: string | null; domain?: string | null; company?: string | null; origin?: string | null }): Promise<string> {
    const site = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { pms_base_url: true },
    });
    const globalBase = (site?.pms_base_url || "").replace(/\/$/, "");
    const matchHost = normalizeHost(input.host) || (input.domain || "").trim().toLowerCase();
    let company: { id: string; booking_engine_slug: string | null; seo_base_url: string | null } | null = null;

    if (matchHost) {
      const rows = await this.prisma.companies.findMany({
        where: { is_active: true, seo_custom_domain: { not: null } },
        select: { id: true, booking_engine_slug: true, seo_base_url: true, seo_custom_domain: true },
      });
      const found = rows.find((row) => normalizeHost(row.seo_custom_domain) === matchHost);
      if (found) company = found;
    }
    if (!company && input.company) {
      company = await this.prisma.companies.findFirst({
        where: { booking_engine_slug: input.company.trim(), is_active: true },
        select: { id: true, booking_engine_slug: true, seo_base_url: true },
      });
    }

    const urls: string[] = [];
    if (company) {
      const baseUrl = company.seo_base_url?.trim().replace(/\/$/, "") || globalBase || input.origin?.replace(/\/$/, "") || "https://example.com";
      urls.push(`${baseUrl}/`, `${baseUrl}/motor`, `${baseUrl}/login`);
      if (company.booking_engine_slug) urls.push(`${baseUrl}/motor/${encodeURIComponent(company.booking_engine_slug)}`);
      const establishments = await this.prisma.establishments.findMany({
        where: { company_id: company.id, is_active: true },
        select: { slug: true, numeric_id: true, id: true },
      });
      for (const establishment of establishments) {
        urls.push(`${baseUrl}/reservar/${encodeURIComponent(establishment.slug || String(establishment.numeric_id) || establishment.id)}`);
      }
    } else {
      const baseUrl = globalBase || input.origin?.replace(/\/$/, "") || "https://example.com";
      urls.push(`${baseUrl}/`, `${baseUrl}/motor`, `${baseUrl}/login`);
      const companies = await this.prisma.companies.findMany({
        where: { is_active: true, booking_engine_slug: { not: null } },
        select: { booking_engine_slug: true },
      });
      for (const row of companies) {
        if (row.booking_engine_slug) urls.push(`${baseUrl}/motor/${encodeURIComponent(row.booking_engine_slug)}`);
      }
      const establishments = await this.prisma.establishments.findMany({
        where: { is_active: true },
        select: { slug: true, numeric_id: true, id: true },
      });
      for (const establishment of establishments) {
        urls.push(`${baseUrl}/reservar/${encodeURIComponent(establishment.slug || String(establishment.numeric_id) || establishment.id)}`);
      }
    }

    const lastmod = new Date().toISOString().slice(0, 10);
    const body = urls
      .map((loc) => `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`)
      .join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`;
  }
}
