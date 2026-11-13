import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SITE_SETTINGS_ID } from "./robots.service";

const COMPANY_SELECT = {
  id: true,
  name: true,
  booking_engine_title: true,
  booking_engine_meta_description: true,
  booking_engine_og_title: true,
  booking_engine_og_description: true,
  booking_engine_og_image: true,
  booking_engine_favicon: true,
  booking_engine_custom_domain: true,
  booking_engine_slug: true,
} as const;

@Injectable()
export class RenderHtmlService {
  constructor(private readonly prisma: PrismaService) {}

  async render(input: { path?: string; siteUrl?: string; establishmentId?: string }) {
    const siteUrl = (input.siteUrl || "").replace(/\/$/, "");
    const pathname = input.path || "/";
    let host = "";
    try {
      host = new URL(input.siteUrl || "http://localhost").host.toLowerCase().split(":")[0];
    } catch {
      host = "";
    }
    let company = await this.company(input.establishmentId, host, pathname);
    const settings = await this.prisma.site_settings.findUnique({ where: { id: SITE_SETTINGS_ID } });
    const currentUrl = `${siteUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
    const faviconBase = absoluteUrl(company?.booking_engine_favicon?.trim() || null, siteUrl);
    const faviconUrl = faviconBase ? `${faviconBase}${faviconBase.includes("?") ? "&" : "?"}v=${escapeAttr(company?.id || "")}` : null;
    const ogTitle = escapeAttr(company?.booking_engine_og_title?.trim() || company?.booking_engine_title?.trim() || company?.name || settings?.og_title || settings?.site_title || "");
    const ogDescription = escapeAttr(company?.booking_engine_og_description?.trim() || company?.booking_engine_meta_description?.trim() || settings?.og_description?.trim() || settings?.site_description?.trim() || "");
    const ogImage = absoluteUrl(company?.booking_engine_og_image?.trim() || settings?.og_image?.trim() || null, siteUrl);
    const metaDescription = escapeAttr(company?.booking_engine_meta_description?.trim() || settings?.meta_description?.trim() || settings?.site_description?.trim() || "");
    const siteTitle = ogTitle;
    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${siteTitle || "Carregando..."}</title>
    <meta name="description" content="${metaDescription}" />
    ${siteTitle ? `<meta name="author" content="${siteTitle}" />` : ""}
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeAttr(currentUrl)}" />
    ${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    ${ogImage ? `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />` : ""}
    ${faviconUrl ? `<link rel="preload" as="image" href="${escapeAttr(faviconUrl)}" />
    <link rel="icon" href="${escapeAttr(faviconUrl)}" type="image/x-icon" />` : ""}
    <style>
      #root:empty::before { content: ""; display: block; width: 100vw; height: 100vh; background: #f8f9fa; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div id="root">
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #f8f9fa;">
        <div style="text-align: center;">
          <div style="width: 48px; height: 48px; border: 4px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
          <p style="color: #6b7280; font-size: 14px;">Carregando...</p>
        </div>
      </div>
    </div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    return html;
  }

  private async company(establishmentId: string | undefined, host: string, pathname: string) {
    if (establishmentId) {
      const establishment = await this.prisma.establishments.findUnique({ where: { id: establishmentId }, select: { company_id: true } });
      if (establishment?.company_id) {
        const found = await this.prisma.companies.findUnique({ where: { id: establishment.company_id }, select: COMPANY_SELECT });
        if (found) return found;
      }
    }
    if (host) {
      const normalized = host.replace(/^www\./, "");
      const rows = await this.prisma.companies.findMany({ where: { booking_engine_custom_domain: { not: null } }, select: COMPANY_SELECT });
      const found = rows.find((row) => normalizeDomain(row.booking_engine_custom_domain) === normalized);
      if (found) return found;
    }
    if (host && (host.includes("vercel.app") || host.includes("localhost") || host.includes("127.0.0.1"))) {
      const slug = host.split(".")[0];
      const found = await this.prisma.companies.findFirst({ where: { booking_engine_slug: slug }, select: COMPANY_SELECT });
      if (found) return found;
    }
    const slug = pathname.match(/^\/motor\/([^/]+)/)?.[1];
    if (!slug) return null;
    return this.prisma.companies.findFirst({ where: { booking_engine_slug: slug }, select: COMPANY_SELECT });
  }
}

function normalizeDomain(value: string | null): string {
  return (value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(":")[0];
}

function absoluteUrl(url: string | null, siteUrl: string): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("data:")) return null;
  if (url.startsWith("/")) return `${siteUrl}${url}`;
  if (url.startsWith("//")) return `https:${url}`;
  return `${siteUrl}/${url}`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
