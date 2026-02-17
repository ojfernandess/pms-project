import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Normaliza host para comparação: minúsculo, sem porta */
function normalizeHost(host: string | null): string {
  if (!host || typeof host !== "string") return "";
  const h = host.split(":")[0].toLowerCase().trim();
  return h;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) return new Response("Server configuration error", { status: 500 });
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const host = normalizeHost(req.headers.get("x-forwarded-host") || req.headers.get("host"));
    const queryDomain = (url.searchParams.get("domain") || url.searchParams.get("host") || "").trim().toLowerCase();
    const queryCompany = (url.searchParams.get("company") || "").trim();

    const { data: siteRow } = await supabase.from("site_settings").select("pms_base_url").eq("id", SITE_SETTINGS_ID).maybeSingle();
    const globalBase = (siteRow?.pms_base_url || "").replace(/\/$/, "");

    let company: { id: string; booking_engine_slug: string | null; seo_base_url: string | null } | null = null;

    if (host || queryDomain) {
      const matchHost = host || queryDomain;
      const { data: byDomain } = await supabase
        .from("companies")
        .select("id, booking_engine_slug, seo_base_url, seo_custom_domain")
        .not("seo_custom_domain", "is", null)
        .eq("is_active", true);
      for (const c of byDomain || []) {
        const d = (c as { seo_custom_domain?: string }).seo_custom_domain;
        if (d && normalizeHost(d) === matchHost) {
          company = { id: c.id, booking_engine_slug: c.booking_engine_slug, seo_base_url: c.seo_base_url };
          break;
        }
      }
    }
    if (!company && queryCompany) {
      const { data: bySlug } = await supabase
        .from("companies")
        .select("id, booking_engine_slug, seo_base_url")
        .eq("booking_engine_slug", queryCompany)
        .eq("is_active", true)
        .maybeSingle();
      if (bySlug) company = { id: bySlug.id, booking_engine_slug: bySlug.booking_engine_slug, seo_base_url: bySlug.seo_base_url };
    }

    let baseUrl: string;
    const urls: string[] = [];

    if (company) {
      baseUrl = (company.seo_base_url && company.seo_base_url.trim()) ? company.seo_base_url.replace(/\/$/, "") : globalBase;
      if (!baseUrl) baseUrl = (req.headers.get("origin") || req.headers.get("referer") || "").replace(/\/$/, "") || "https://example.com";
      urls.push(baseUrl + "/");
      urls.push(baseUrl + "/motor");
      urls.push(baseUrl + "/login");
      if (company.booking_engine_slug) urls.push(baseUrl + "/motor/" + encodeURIComponent(company.booking_engine_slug));
      const { data: establishments } = await supabase
        .from("establishments")
        .select("slug, numeric_id, id")
        .eq("company_id", company.id)
        .eq("is_active", true);
      for (const e of establishments || []) {
        const slug = e.slug || e.numeric_id?.toString() || e.id;
        urls.push(baseUrl + "/reservar/" + encodeURIComponent(slug));
      }
    } else {
      baseUrl = globalBase || (req.headers.get("origin") || req.headers.get("referer") || "").replace(/\/$/, "") || "https://example.com";
      urls.push(baseUrl + "/");
      urls.push(baseUrl + "/motor");
      urls.push(baseUrl + "/login");
      const { data: companies } = await supabase.from("companies").select("booking_engine_slug").not("booking_engine_slug", "is", null).eq("is_active", true);
      for (const c of companies || []) {
        if (c.booking_engine_slug) urls.push(baseUrl + "/motor/" + encodeURIComponent(c.booking_engine_slug));
      }
      const { data: establishments } = await supabase.from("establishments").select("slug, numeric_id, id").eq("is_active", true);
      for (const e of establishments || []) {
        const slug = e.slug || e.numeric_id?.toString() || e.id;
        urls.push(baseUrl + "/reservar/" + encodeURIComponent(slug));
      }
    }

    const lastmod = new Date().toISOString().split("T")[0];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const loc of urls) {
      xml += "  <url>\n    <loc>" + escapeXml(loc) + "</loc>\n    <lastmod>" + lastmod + "</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n";
    }
    xml += "</urlset>";
    return new Response(xml, { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" } });
  } catch (err) {
    console.error(err);
    return new Response("Error generating sitemap", { status: 500 });
  }
});
