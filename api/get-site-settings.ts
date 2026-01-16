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
    // Tentar múltiplas variáveis de ambiente (Vercel pode usar diferentes nomes)
    const supabaseUrl = process.env.VITE_SUPABASE_URL 
      || process.env.SUPABASE_URL 
      || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY 
      || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl) {
      console.error("⚠️ Variáveis de ambiente do Supabase não configuradas. Tentando:", {
        VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      });
      
      // Tentar inferir URL do Supabase a partir do request (se disponível)
      // Em alguns casos, podemos tentar usar uma URL padrão ou inferir do contexto
      // Por enquanto, retornar objeto vazio (não quebrar a página)
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

    if (!supabaseServiceKey) {
      console.error("⚠️ SUPABASE_SERVICE_ROLE_KEY não configurada");
      // Tentar usar Edge Function como fallback
      if (supabaseUrl) {
        try {
          const edgeFunctionUrl = `${supabaseUrl.replace("/rest/v1", "").replace(/\/$/, "")}/functions/v1/get-site-settings`;
          console.log(`🔄 Tentando usar Edge Function como fallback: ${edgeFunctionUrl}`);
          const edgeResponse = await fetch(edgeFunctionUrl, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });
          
          if (edgeResponse.ok) {
            const edgeData = await edgeResponse.json();
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
            res.setHeader("Access-Control-Allow-Origin", "*");
            return res.status(200).json(edgeData);
          }
        } catch (edgeError) {
          console.error("⚠️ Erro ao chamar Edge Function:", edgeError);
        }
      }
      
      // Retornar objeto vazio em vez de erro 500 (não quebrar a página)
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
      console.error(`⚠️ Erro ao buscar configurações: ${response.status} ${response.statusText}`);
      
      // Tentar usar Edge Function como fallback
      try {
        const edgeFunctionUrl = `${supabaseUrl.replace("/rest/v1", "").replace(/\/$/, "")}/functions/v1/get-site-settings`;
        console.log(`🔄 Tentando usar Edge Function como fallback: ${edgeFunctionUrl}`);
        const edgeResponse = await fetch(edgeFunctionUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        
        if (edgeResponse.ok) {
          const edgeData = await edgeResponse.json();
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
          res.setHeader("Access-Control-Allow-Origin", "*");
          return res.status(200).json(edgeData);
        }
      } catch (edgeError) {
        console.error("⚠️ Erro ao chamar Edge Function:", edgeError);
      }
      
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
      
      // Para outros erros, também retornar objeto vazio (não quebrar a página)
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

