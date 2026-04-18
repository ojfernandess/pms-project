import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

function normalizeHost(host: string | null): string {
  if (!host || typeof host !== "string") return "";
  return host.split(":")[0].toLowerCase().trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return new Response("Server configuration error", { status: 500 });
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const host = normalizeHost(req.headers.get("x-forwarded-host") || req.headers.get("host"));
    const queryDomain = (url.searchParams.get("domain") || url.searchParams.get("host") || "").trim().toLowerCase();
    const queryCompany = (url.searchParams.get("company") || "").trim();

    const { data: siteRow } = await supabase
      .from("site_settings")
      .select("robots_txt, pms_base_url")
      .eq("id", SITE_SETTINGS_ID)
      .maybeSingle();

    let baseUrl: string = (siteRow?.pms_base_url || req.headers.get("origin") || "https://example.com").replace(/\/$/, "");
    let robotsTxt: string | null = siteRow?.robots_txt?.trim() || null;

    if (host || queryDomain || queryCompany) {
      const matchHost = host || queryDomain;
      let company: { robots_txt?: string | null; seo_base_url?: string | null } | null = null;

      if (matchHost) {
        const { data: byDomain } = await supabase
          .from("companies")
          .select("robots_txt, seo_base_url, seo_custom_domain")
          .not("seo_custom_domain", "is", null)
          .eq("is_active", true);
        for (const c of byDomain || []) {
          const d = (c as { seo_custom_domain?: string }).seo_custom_domain;
          if (d && normalizeHost(d) === matchHost) {
            company = c;
            break;
          }
        }
      }
      if (!company && queryCompany) {
        const { data: bySlug } = await supabase
          .from("companies")
          .select("robots_txt, seo_base_url")
          .eq("booking_engine_slug", queryCompany)
          .eq("is_active", true)
          .maybeSingle();
        if (bySlug) company = bySlug;
      }

      if (company) {
        if (company.seo_base_url && company.seo_base_url.trim()) {
          baseUrl = company.seo_base_url.replace(/\/$/, "");
        }
        if (company.robots_txt != null && company.robots_txt.trim() !== "") {
          robotsTxt = company.robots_txt.trim();
        }
      }
    }

    const sitemapUrl = `${baseUrl}/sitemap.xml`;
    const defaultRobots = `User-agent: *
Allow: /
Disallow: /admin-dashboard
Disallow: /super-admin
Disallow: /:establishmentId/

Sitemap: ${sitemapUrl}
`;
    const body = robotsTxt || defaultRobots;

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error(err);
    return new Response("Error", { status: 500 });
  }
});
