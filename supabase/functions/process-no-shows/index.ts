/**
 * Supabase Edge Function para processar no-shows automaticamente
 * 
 * Configurar para executar diariamente às 19:00 (ou horário configurado)
 * 
 * Uso:
 * - Deploy: supabase functions deploy process-no-shows
 * - Cron: Configurar no Supabase Dashboard > Database > Cron Jobs
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Obter parâmetros opcionais
    const { establishment_id, process_time } = await req.json().catch(() => ({}));
    const processTime = process_time || new Date().toISOString();

    console.log("🔄 Iniciando processamento de no-shows...", {
      establishment_id: establishment_id || "todos",
      process_time: processTime,
    });

    // Chamar função RPC do Supabase
    const { data, error } = await supabase.rpc("process_no_shows", {
      p_establishment_id: establishment_id || null,
    });

    if (error) {
      console.error("❌ Erro ao processar no-shows:", error);
      
      // Se a função RPC não existir, tentar método alternativo
      if (error.code === "PGRST202" || error.message?.includes("Could not find the function")) {
        console.warn("⚠️ Função RPC não encontrada. Usando método alternativo...");
        
        // Buscar reservas candidatas manualmente
        const now = new Date(processTime);
        const currentDate = now.toISOString().split("T")[0];
        
        let query = supabase
          .from("reservations")
          .select("id, checkin_date, status, establishment_id")
          .eq("status", "confirmed")
          .lte("checkin_date", currentDate)
          .is("cancelled_at", null)
          .is("no_show_at", null);

        if (establishment_id) {
          query = query.eq("establishment_id", establishment_id);
        }

        const { data: reservations, error: resError } = await query;

        if (resError) {
          throw resError;
        }

        let processedCount = 0;

        for (const reservation of reservations || []) {
          const checkinDate = new Date(reservation.checkin_date);
          const checkinDeadline = new Date(checkinDate);
          checkinDeadline.setHours(18, 0, 0, 0);

          if (now > checkinDeadline) {
            // Marcar como no-show
            const { error: updateError } = await supabase
              .from("reservations")
              .update({
                status: "noshow",
                no_show_at: now.toISOString(),
              })
              .eq("id", reservation.id);

            if (!updateError) {
              processedCount++;
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            processed: processedCount,
            method: "alternative",
            message: `${processedCount} no-show(s) processado(s)`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      throw error;
    }

    const processedCount = data || 0;

    console.log(`✅ ${processedCount} no-show(s) processado(s) com sucesso`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        method: "rpc",
        message: `${processedCount} no-show(s) processado(s)`,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("❌ Erro fatal:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Erro ao processar no-shows",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

