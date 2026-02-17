/**
 * Proxy do sitemap – funciona em qualquer ambiente (Vercel, Netlify, Node, etc.)
 * Repassa a requisição para a Edge Function do Supabase e envia o Host da requisição
 * para que o sitemap seja gerado para o domínio/empresa correto (SEO por domínio).
 *
 * Em Vercel: use rewrite /sitemap.xml -> /api/sitemap
 * Em outros hosts: configure o servidor para que /sitemap.xml chame esta função
 * e repasse os headers Host / X-Forwarded-Host.
 */

type Req = { method?: string; headers?: { host?: string; "x-forwarded-host"?: string } };
type Res = {
  status: (code: number) => Res;
  setHeader: (key: string, value: string) => Res;
  send: (body: string) => void;
  end: () => void;
};

export default async function handler(req: Req, res: Res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).setHeader("Allow", "GET, HEAD");
    return res.end();
  }

  try {
    const supabaseUrl =
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) {
      console.error("Sitemap: SUPABASE_URL não configurada");
      return res.status(500).send("Server configuration error");
    }

    const baseUrl = supabaseUrl.replace(/\/rest\/v1.*$/, "").replace(/\/$/, "");
    const edgeUrl = `${baseUrl}/functions/v1/sitemap`;

    const host = req.headers?.host || "";
    const forwardedHost = (req.headers as Record<string, string | undefined>)["x-forwarded-host"];

    const response = await fetch(edgeUrl, {
      method: "GET",
      headers: {
        Accept: "application/xml",
        "Content-Type": "application/xml",
        ...(host && { Host: host }),
        ...(forwardedHost && { "X-Forwarded-Host": forwardedHost }),
      },
    });

    if (!response.ok) {
      console.error("Sitemap: Edge Function retornou", response.status);
      return res.status(response.status).send("Error generating sitemap");
    }

    const xml = await response.text();
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(xml);
  } catch (err) {
    console.error("Sitemap proxy error:", err);
    return res.status(500).send("Error generating sitemap");
  }
}
