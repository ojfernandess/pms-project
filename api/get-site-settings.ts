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
    // Obter URL do Supabase e Service Role Key das variáveis de ambiente
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl) {
      console.error("VITE_SUPABASE_URL ou SUPABASE_URL não configurado");
      return res.status(500).json({ error: "Configuração do Supabase não encontrada" });
    }

    if (!supabaseServiceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY não configurado");
      return res.status(500).json({ error: "Chave de serviço do Supabase não encontrada" });
    }

    // Buscar diretamente do banco usando REST API do Supabase
    const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";
    const apiUrl = `${supabaseUrl}/rest/v1/site_settings?id=eq.${SITE_SETTINGS_ID}&select=*`;
    
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Prefer": "return=representation",
      },
    });

    if (!response.ok) {
      console.error(`Erro ao buscar configurações: ${response.status} ${response.statusText}`);
      // Retornar objeto vazio se não encontrar (não é erro crítico)
      if (response.status === 404 || response.status === 406) {
        return res.status(200).json({
          site_title: "",
          site_description: "",
          meta_description: "",
          og_title: "",
          og_description: "",
          og_image: null,
          logo_url: null,
          favicon_url: null,
          pms_base_url: null,
        });
      }
      return res.status(response.status).json({ 
        error: "Erro ao buscar configurações do site",
        status: response.status 
      });
    }

    const data = await response.json();
    const settings = Array.isArray(data) && data.length > 0 ? data[0] : (data || {
      site_title: "",
      site_description: "",
      meta_description: "",
      og_title: "",
      og_description: "",
      og_image: null,
      logo_url: null,
      favicon_url: null,
      pms_base_url: null,
    });
    
    // Retornar configurações com headers apropriados
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300"); // Cache de 5 minutos
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json(settings);
  } catch (error) {
    console.error("Erro ao buscar configurações:", error);
    // Retornar objeto vazio em caso de erro (não quebrar a página)
    return res.status(200).json({
      site_title: "",
      site_description: "",
      meta_description: "",
      og_title: "",
      og_description: "",
      og_image: null,
      logo_url: null,
      favicon_url: null,
      pms_base_url: null,
    });
  }
}

