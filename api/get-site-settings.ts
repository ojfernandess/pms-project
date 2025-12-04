// API Route para retornar configurações do site
// Esta rota não requer a URL do Supabase no cliente, pois usa variáveis de ambiente do servidor

type VercelRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (data: any) => void;
  send: (data: string) => void;
  setHeader: (key: string, value: string) => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Permitir apenas requisições GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Obter URL do Supabase das variáveis de ambiente
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    
    if (!supabaseUrl) {
      console.error("VITE_SUPABASE_URL ou SUPABASE_URL não configurado");
      return res.status(500).json({ error: "Configuração do Supabase não encontrada" });
    }

    // Construir URL da Edge Function get-site-settings
    const cleanUrl = supabaseUrl.replace("/rest/v1", "").replace(/\/$/, "");
    const edgeFunctionUrl = `${cleanUrl}/functions/v1/get-site-settings`;

    // Fazer requisição para a Edge Function do Supabase
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout
    
    const response = await fetch(edgeFunctionUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Erro ao buscar configurações: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ 
        error: "Erro ao buscar configurações do site",
        status: response.status 
      });
    }

    const settings = await response.json();
    
    // Retornar configurações com headers apropriados
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300"); // Cache de 5 minutos
    return res.status(200).json(settings);
  } catch (error) {
    console.error("Erro ao buscar configurações:", error);
    return res.status(500).json({ 
      error: "Erro interno do servidor",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

