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
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response("Erro de configuração", { 
        status: 500,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar configurações do site
    const { data: settings, error } = await supabase
      .from("site_settings")
      .select("*")
      .eq("id", SITE_SETTINGS_ID)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar configurações:", error);
    }

    // Obter URL da requisição
    const requestUrl = new URL(req.url);
    // Extrair o pathname da query string se fornecido (para suportar diferentes rotas)
    const pathname = new URL(req.url).searchParams.get("path") || requestUrl.pathname;
    const siteUrl = requestUrl.searchParams.get("siteUrl") || `${requestUrl.protocol}//${requestUrl.host}`;
    
    // Função para garantir URL absoluta
    const ensureAbsoluteUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
      }
      if (url.startsWith("data:")) {
        return null; // Data URLs não funcionam com Open Graph
      }
      if (url.startsWith("/")) {
        return `${siteUrl}${url}`;
      }
      if (url.startsWith("//")) {
        return `${requestUrl.protocol}${url}`;
      }
      return `${siteUrl}/${url}`;
    };

    const ogTitle = escapeAttr(settings?.og_title || settings?.site_title || "");
    const ogDescription = escapeAttr(settings?.og_description || settings?.site_description || "");
    const ogImage = ensureAbsoluteUrl(settings?.og_image);
    const metaDescription = escapeAttr(settings?.meta_description || settings?.site_description || "");
    const siteTitle = escapeAttr(settings?.site_title || "");
    const currentUrl = `${siteUrl}${pathname}`;

    // Gerar HTML com meta tags preenchidas (usando escape para segurança)
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
    ${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:type" content="image/png" />` : ''}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${ogTitle}" />
    <meta name="twitter:description" content="${ogDescription}" />
    ${ogImage ? `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />` : ''}
    
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

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300", // Cache de 5 minutos
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Erro na função:", error);
    return new Response("Erro interno do servidor", { 
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});

