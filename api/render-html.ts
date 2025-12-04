// Tipos para Vercel API Routes (fornecidos automaticamente pelo Vercel)
type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (data: any) => void;
  send: (data: string) => void;
  redirect: (code: number, url: string) => void;
  setHeader: (key: string, value: string) => void;
};

// Lista de User-Agents de crawlers conhecidos
const CRAWLER_USER_AGENTS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "LinkedInBot",
  "WhatsApp",
  "TelegramBot",
  "Slackbot",
  "Applebot",
  "Googlebot",
  "Bingbot",
  "YandexBot",
  "Baiduspider",
  "Slurp",
  "DuckDuckBot",
  "Sogou",
  "Exabot",
  "ia_archiver",
  "archive.org_bot",
  "MJ12bot",
  "AhrefsBot",
  "SemrushBot",
  "DotBot",
  "Baiduspider",
  "YisouSpider",
  "Sogou web spider",
  "Bytespider",
  "MetaInspector",
  "facebookexternalhit/1.1",
  "facebookexternalhit/1.0",
];

// Verificar se o User-Agent é um crawler
function isCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_USER_AGENTS.some((crawler) => ua.includes(crawler.toLowerCase()));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Permitir apenas requisições GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userAgent = req.headers["user-agent"];
  const pathname = (req.query.path as string) || "/";
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || req.headers["x-forwarded-host"];
  const siteUrl = (req.query.siteUrl as string) || `${protocol}://${host}`;

  // Se não for um crawler e não tiver o parâmetro force, redirecionar para a página normal
  if (!isCrawler(userAgent) && !req.query.force) {
    return res.redirect(302, pathname);
  }

  try {
    // Obter URL do Supabase das variáveis de ambiente
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    
    if (!supabaseUrl) {
      console.error("VITE_SUPABASE_URL ou SUPABASE_URL não configurado");
      return res.status(500).send("Configuração do Supabase não encontrada");
    }

    // Construir URL da Edge Function render-html
    const cleanUrl = supabaseUrl.replace("/rest/v1", "").replace(/\/$/, "");
    const edgeFunctionUrl = `${cleanUrl}/functions/v1/render-html?path=${encodeURIComponent(pathname)}&siteUrl=${encodeURIComponent(siteUrl)}`;

    // Fazer requisição para a Edge Function do Supabase
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout
    
    const response = await fetch(edgeFunctionUrl, {
      method: "GET",
      headers: {
        "Content-Type": "text/html",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Erro ao buscar HTML renderizado: ${response.status} ${response.statusText}`);
      // Se a Edge Function falhar, retornar HTML básico
      return res.status(200).send(getFallbackHtml(siteUrl, pathname));
    }

    const html = await response.text();
    
    // Retornar HTML com headers apropriados
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300"); // Cache de 5 minutos
    return res.status(200).send(html);
  } catch (error) {
    console.error("Erro ao renderizar HTML:", error);
    // Em caso de erro, retornar HTML básico
    return res.status(200).send(getFallbackHtml(siteUrl, pathname));
  }
}

// HTML de fallback caso a Edge Function falhe
function getFallbackHtml(siteUrl: string, pathname: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Carregando...</title>
    <meta name="description" content="" />
    <meta property="og:title" content="Carregando..." />
    <meta property="og:description" content="" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${siteUrl}${pathname}" />
    <meta name="twitter:card" content="summary_large_image" />
    <style>
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
}

