// Edge Function para Health Check do Sistema
// Retorna status de saúde do sistema para monitoramento

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: { status: "ok" | "error"; responseTime?: number; error?: string };
    storage: { status: "ok" | "error"; error?: string };
  };
  metrics?: {
    database_response_time?: number;
    uptime?: number;
  };
}

serve(async (req) => {
  // Log inicial para garantir que a função está sendo executada
  console.log("=== HEALTH CHECK FUNCTION CALLED ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  console.log("Timestamp:", new Date().toISOString());
  
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    console.log("CORS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("Health check started at:", startTime);
  const checks: HealthCheckResult["checks"] = {
    database: { status: "error" },
    storage: { status: "error" },
  };

  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    console.log("Health check iniciado:", {
      timestamp: new Date().toISOString(),
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
    });
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check 1: Database
    try {
      const dbStartTime = Date.now();
      console.log("Verificando conexão com database...");
      const { error: dbError } = await supabase
        .from("establishments")
        .select("id")
        .limit(1);
      const dbResponseTime = Date.now() - dbStartTime;

      if (dbError) {
        console.error("Erro no database check:", dbError);
        checks.database = {
          status: "error",
          error: dbError.message,
        };
        overallStatus = "unhealthy";
      } else {
        console.log("Database check OK:", { responseTime: dbResponseTime });
        checks.database = {
          status: "ok",
          responseTime: dbResponseTime,
        };
      }
    } catch (error) {
      console.error("Exceção no database check:", error);
      checks.database = {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      overallStatus = "unhealthy";
    }

    // Check 2: Storage
    try {
      console.log("Verificando conexão com storage...");
      const { error: storageError } = await supabase.storage.listBuckets();
      if (storageError) {
        console.error("Erro no storage check:", storageError);
        checks.storage = {
          status: "error",
          error: storageError.message,
        };
        if (overallStatus === "healthy") overallStatus = "degraded";
      } else {
        console.log("Storage check OK");
        checks.storage = {
          status: "ok",
        };
      }
    } catch (error) {
      console.error("Exceção no storage check:", error);
      checks.storage = {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      if (overallStatus === "healthy") overallStatus = "degraded";
    }

    const totalResponseTime = Date.now() - startTime;

    const result: HealthCheckResult = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      checks,
      metrics: {
        database_response_time: checks.database.responseTime,
      },
    };

    console.log("Health check concluído:", {
      status: overallStatus,
      totalResponseTime,
      checks: {
        database: checks.database.status,
        storage: checks.storage.status,
      },
    });

    // Retornar status HTTP apropriado
    const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;

    return new Response(
      JSON.stringify(result),
      {
        status: statusCode,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Erro crítico no health check:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    const result: HealthCheckResult = {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      checks: {
        database: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
        storage: {
          status: "error",
          error: "Health check falhou",
        },
      },
    };

    return new Response(
      JSON.stringify(result),
      {
        status: 503,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

