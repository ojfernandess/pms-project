// Proxy robots.txt - repassa para Edge Function do Supabase com Host (SEO por dominio)

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
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return res.status(500).send("Server configuration error");
    const baseUrl = supabaseUrl.replace(/\/rest\/v1.*$/, "").replace(/\/$/, "");
    const edgeUrl = baseUrl + "/functions/v1/robots";
    const host = req.headers?.host || "";
    const forwardedHost = (req.headers as Record<string, string | undefined>)["x-forwarded-host"];
    const response = await fetch(edgeUrl, {
      method: "GET",
      headers: { Accept: "text/plain", ...(host && { Host: host }), ...(forwardedHost && { "X-Forwarded-Host": forwardedHost }) },
    });
    if (!response.ok) return res.status(response.status).send("Error");
    const body = await response.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(body);
  } catch (err) {
    console.error("Robots proxy error:", err);
    return res.status(500).send("Error");
  }
}
