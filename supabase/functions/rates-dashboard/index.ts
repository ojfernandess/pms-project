// Edge Function: GET /rates/dashboard
// Agrega dados do Dashboard de Preços em uma única chamada
// Parâmetros: establishment_id (obrigatório)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  console.log("[rates-dashboard] Iniciando...");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[rates-dashboard] Rejeitado: sem Authorization");
      return new Response(
        JSON.stringify({ error: "Autorização obrigatória" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const establishmentId = url.searchParams.get("establishment_id");
    if (!establishmentId) {
      console.log("[rates-dashboard] Rejeitado: establishment_id ausente");
      return new Response(
        JSON.stringify({ error: "establishment_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[rates-dashboard] establishment_id=${establishmentId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Validar token do usuário
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.log("[rates-dashboard] Rejeitado: token inválido");
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar todos os dados em paralelo
    const [categoriesRes, ratePlansRes, planTypesRes, hotelSettingsRes] = await Promise.all([
      supabase
        .from("room_categories")
        .select("id, name, base_price")
        .eq("establishment_id", establishmentId)
        .order("name"),
      supabase
        .from("pricing_plans")
        .select("id, name, code, plan_type, is_active")
        .eq("establishment_id", establishmentId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name"),
      supabase
        .from("pricing_plan_types")
        .select("id, name, description, color, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name"),
      supabase
        .from("hotel_settings")
        .select("rate_system_settings")
        .eq("establishment_id", establishmentId)
        .maybeSingle(),
    ]);

    if (categoriesRes.error) throw categoriesRes.error;
    if (ratePlansRes.error) throw ratePlansRes.error;
    if (planTypesRes.error) throw planTypesRes.error;
    if (hotelSettingsRes.error) throw hotelSettingsRes.error;

    const response = {
      categories: categoriesRes.data ?? [],
      ratePlans: ratePlansRes.data ?? [],
      planTypes: planTypesRes.data ?? [],
      hotelSettings: hotelSettingsRes.data ?? null,
    };

    console.log(`[rates-dashboard] OK: ${response.categories.length} categorias, ${response.ratePlans.length} planos`);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[rates-dashboard]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
