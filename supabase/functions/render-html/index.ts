import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

// Função para escapar HTML (prevenir XSS)
function escapeHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Função para escapar atributos HTML
function escapeAttr(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

serve(async (req) => {
  console.log("=== render-html Edge Function chamada ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  // Permitir CORS para requisições de outros domínios
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
    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    console.log("Supabase URL configurada:", !!supabaseUrl);
    console.log("Service Key configurada:", !!supabaseServiceKey);
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Erro: Configuração do Supabase não encontrada");
      return new Response("Erro de configuração", { 
        status: 500,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Obter URL da requisição
    const requestUrl = new URL(req.url);
    const pathname = requestUrl.searchParams.get("path") || requestUrl.pathname || "/";
    const siteUrlParam = requestUrl.searchParams.get("siteUrl") || `${requestUrl.protocol}//${requestUrl.host}`;
    const siteUrl = siteUrlParam.replace(/\/$/, "");
    let host = "";
    try {
      host = new URL(siteUrlParam).host.toLowerCase().split(":")[0];
    } catch {
      host = "";
    }

    // Resolver empresa para meta do motor: domínio, subdomínio, path /motor/:slug ou establishment_id na URL
    type CompanyMeta = { id?: string; name?: string; booking_engine_title?: string; booking_engine_meta_description?: string; booking_engine_og_title?: string; booking_engine_og_description?: string; booking_engine_og_image?: string; booking_engine_custom_domain?: string; booking_engine_favicon?: string | null };
    let company: CompanyMeta | null = null;

    // 1) Por establishment_id (query param)
    const establishmentIdParam = requestUrl.searchParams.get("establishment_id")?.trim();
    if (!company && establishmentIdParam) {
      const { data: est } = await supabase
        .from("establishments")
        .select("company_id")
        .eq("id", establishmentIdParam)
        .maybeSingle();
      if (est && (est as { company_id?: string }).company_id) {
        const { data: companyByEst } = await supabase
          .from("companies")
          .select("id, name, booking_engine_title, booking_engine_meta_description, booking_engine_og_title, booking_engine_og_description, booking_engine_og_image, booking_engine_favicon, booking_engine_custom_domain")
          .eq("id", (est as { company_id: string }).company_id)
          .maybeSingle();
        if (companyByEst) company = companyByEst as CompanyMeta;
      }
    }

    // 2) Por domínio personalizado
    if (!company && host) {
      const normalizedHost = host.trim().toLowerCase().replace(/^www\./, "");
      const { data: companiesWithDomain } = await supabase
        .from("companies")
        .select("id, name, booking_engine_title, booking_engine_meta_description, booking_engine_og_title, booking_engine_og_description, booking_engine_og_image, booking_engine_favicon, booking_engine_custom_domain")
        .not("booking_engine_custom_domain", "is", null);
      if (companiesWithDomain && companiesWithDomain.length > 0) {
        for (const c of companiesWithDomain as CompanyMeta[]) {
          const d = (c.booking_engine_custom_domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(":")[0];
          if (d === normalizedHost) {
            company = c;
            break;
          }
        }
      }
    }

    // 3) Por subdomínio (ex: reservas.vercel.app -> slug "reservas") em domínios tipo Vercel
    if (!company && host) {
      const isVercelLike = host.includes("vercel.app") || host.includes("localhost") || host.includes("127.0.0.1");
      if (isVercelLike) {
        const parts = host.split(".");
        if (parts.length >= 2) {
          const potentialSlug = parts[0];
          const { data: companyBySub } = await supabase
            .from("companies")
            .select("id, name, booking_engine_title, booking_engine_meta_description, booking_engine_og_title, booking_engine_og_description, booking_engine_og_image, booking_engine_favicon, booking_engine_custom_domain")
            .eq("booking_engine_slug", potentialSlug)
            .maybeSingle();
          if (companyBySub) company = companyBySub as CompanyMeta;
        }
      }
    }

    // 4) Por path /motor/:slug
    if (!company && pathname.startsWith("/motor/")) {
      const slugMatch = pathname.match(/^\/motor\/([^/]+)/);
      const slug = slugMatch ? slugMatch[1] : null;
      if (slug) {
        const { data: companyBySlug } = await supabase
          .from("companies")
          .select("id, name, booking_engine_title, booking_engine_meta_description, booking_engine_og_title, booking_engine_og_description, booking_engine_og_image, booking_engine_favicon")
          .eq("booking_engine_slug", slug)
          .maybeSingle();
        if (companyBySlug) company = companyBySlug as CompanyMeta;
      }
    }

    // Buscar site_settings para fallback
    const { data: settings, error } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", SITE_SETTINGS_ID)
      .maybeSingle();

    if (error) console.error("Erro ao buscar site_settings:", error);

    function ensureAbsoluteUrl(url: string | null | undefined): string | null {
      if (!url) return null;
      const u = (url || "").trim();
      if (u.startsWith("http://") || u.startsWith("https://")) return u;
      if (u.startsWith("data:")) return null;
      if (u.startsWith("/")) return `${siteUrl}${u}`;
      if (u.startsWith("//")) return `https:${u}`;
      return `${siteUrl}/${u}`;
    }

    const baseUrl = siteUrl.replace(/\/$/, "");
    const currentUrl = `${baseUrl}${pathname.startsWith("/") ? pathname : "/" + pathname}`;

    // Favicon do cliente: apenas se empresa resolvida e com favicon (nunca favicon padrão do PMS)
    const faviconBase = ensureAbsoluteUrl(company?.booking_engine_favicon?.trim() || null);
    const faviconVersion = company?.id || "";
    const faviconUrl = faviconBase
      ? `${faviconBase}${faviconBase.includes("?") ? "&" : "?"}v=${escapeAttr(faviconVersion)}`
      : null;

    if (company) {
      console.log("Meta do motor (empresa resolvida):", { host, pathname, companyName: company.name, hasFavicon: !!faviconUrl });
    }

    const ogTitle = escapeAttr(
      company?.booking_engine_og_title?.trim() ||
      company?.booking_engine_title?.trim() ||
      company?.name ||
      settings?.og_title ||
      settings?.site_title ||
      ""
    );
    const ogDescription = escapeAttr(
      (company?.booking_engine_og_description?.trim() || "") ||
      (company?.booking_engine_meta_description?.trim() || "") ||
      (settings?.og_description?.trim() || "") ||
      (settings?.site_description?.trim() || "") ||
      ""
    );
    const ogImage = ensureAbsoluteUrl(company?.booking_engine_og_image?.trim() || settings?.og_image?.trim() || null);
    const metaDescription = escapeAttr(
      (company?.booking_engine_meta_description?.trim() || "") ||
      (settings?.meta_description?.trim() || "") ||
      (settings?.site_description?.trim() || "") ||
      ""
    );
    const siteTitle = escapeAttr(
      company?.booking_engine_og_title?.trim() ||
      company?.booking_engine_title?.trim() ||
      company?.name ||
      settings?.site_title ||
      ""
    );

    console.log("Valores finais:", {
      ogTitle: ogTitle || "(vazio)",
      ogDescription: ogDescription || "(vazio)",
      ogImage: ogImage || "(vazio)",
      siteTitle: siteTitle || "(vazio)",
      currentUrl,
    });

    // Gerar HTML com meta tags preenchidas (usando escape para segurança)
    // IMPORTANTE: Não incluir og:image se estiver vazio para evitar erro no Facebook
    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${siteTitle || "Carregando..."}</title>
    <meta name="description" content="${metaDescription}" />
    ${siteTitle ? `<meta name="author" content="${siteTitle}" />` : ''}

    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeAttr(currentUrl)}" />
    ${ogImage && ogImage.trim() ? `<meta property="og:image" content="${escapeAttr(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />` : ''}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    ${ogImage && ogImage.trim() ? `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />` : ''}
    ${faviconUrl ? `<link rel="preload" as="image" href="${escapeAttr(faviconUrl)}" />
    <link rel="icon" href="${escapeAttr(faviconUrl)}" type="image/x-icon" />` : ''}
    
    <style>
      #root:empty::before {
        content: "";
        display: block;
        width: 100vw;
        height: 100vh;
        background: #f8f9fa;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <div id="root">
      <div style="display: flex; align-items: center; justify-center; height: 100vh; background: #f8f9fa;">
        <div style="text-align: center;">
          <div style="width: 48px; height: 48px; border: 4px solid #e5e7eb; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
          <p style="color: #6b7280; font-size: 14px;">Carregando...</p>
        </div>
      </div>
    </div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

    console.log("HTML gerado com sucesso, tamanho:", html.length, "bytes");
    
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
        "Vary": "Host",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Erro na função:", error);
    console.error("Stack trace:", error instanceof Error ? error.stack : String(error));
    return new Response("Erro interno do servidor", { 
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});

