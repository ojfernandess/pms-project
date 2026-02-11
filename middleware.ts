// Vercel Edge Middleware para interceptar crawlers
// Este middleware funciona com qualquer framework (Vite, Next.js, etc.)

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
  "YisouSpider",
  "Sogou web spider",
  "Bytespider",
  "MetaInspector",
];

// Verificar se o User-Agent é um crawler
function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_USER_AGENTS.some((crawler) => ua.includes(crawler.toLowerCase()));
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const host = url.host;
  const userAgent = request.headers.get("user-agent");

  // Ignorar requisições para arquivos estáticos, API routes, etc.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.match(/\.(ico|png|jpg|jpeg|gif|svg|css|js|woff|woff2|ttf|eot|json|map)$/)
  ) {
    return;
  }

  // Verificar se é um domínio personalizado (não é o domínio principal do Vercel)
  // Se for um domínio diferente, permitir que passe para o CustomDomainDetector
  // O CustomDomainDetector fará a verificação final no cliente
  const isCustomDomain = host && !host.includes("vercel.app") && !host.includes("localhost");
  
  if (isCustomDomain) {
    console.log("[Middleware] Domínio personalizado detectado:", host);
    // Permitir que a requisição continue normalmente
    // O CustomDomainDetector no cliente fará a verificação final
  }

  // Se for um crawler, buscar o HTML renderizado da Edge Function do Supabase
  if (isCrawler(userAgent)) {
    console.log("Crawler detectado:", userAgent);
    console.log("Pathname:", pathname);
    
    try {
      // Obter URL do Supabase das variáveis de ambiente do Vercel
      // No Vercel Edge Functions, as variáveis de ambiente são expostas via process.env
      // Usar uma abordagem que funciona tanto no Node.js quanto no Edge Functions
      const env = typeof process !== "undefined" && process.env ? process.env : {};
      const supabaseUrl = (env as Record<string, string | undefined>).VITE_SUPABASE_URL || 
                         (env as Record<string, string | undefined>).SUPABASE_URL;
      
      console.log("Supabase URL encontrada:", !!supabaseUrl);
      
      if (supabaseUrl) {
        const cleanUrl = supabaseUrl.replace("/rest/v1", "").replace(/\/$/, "");
        const edgeFunctionUrl = `${cleanUrl}/functions/v1/render-html?path=${encodeURIComponent(pathname)}&siteUrl=${encodeURIComponent(`${url.protocol}//${url.host}`)}`;
        
        console.log("Chamando Edge Function:", edgeFunctionUrl);
        
        const response = await fetch(edgeFunctionUrl, {
          method: "GET",
          headers: {
            "Content-Type": "text/html",
            "User-Agent": userAgent || "",
          },
        });
        
        console.log("Resposta da Edge Function:", response.status, response.statusText);
        
        if (response.ok) {
          const html = await response.text();
          console.log("HTML recebido, tamanho:", html.length, "bytes");
          return new Response(html, {
            status: 200,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "public, max-age=300, s-maxage=300",
            },
          });
        } else {
          const errorText = await response.text();
          console.error("Erro na Edge Function:", response.status, errorText);
        }
      } else {
        console.error("Supabase URL não configurada no middleware");
      }
    } catch (error) {
      console.error("Erro ao buscar HTML renderizado:", error);
      // Continuar e servir o HTML normal se houver erro
    }
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static files (images, fonts, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|ico|css|js|woff|woff2|ttf|eot|json|map)$).*)",
  ],
};

