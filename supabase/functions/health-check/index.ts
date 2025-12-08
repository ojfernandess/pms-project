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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const checks: HealthCheckResult["checks"] = {
    database: { status: "error" },
    storage: { status: "error" },
  };

  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check 1: Database
    try {
      const dbStartTime = Date.now();
      const { error: dbError } = await supabase
        .from("establishments")
        .select("id")
        .limit(1);
      const dbResponseTime = Date.now() - dbStartTime;

      if (dbError) {
        checks.database = {
          status: "error",
          error: dbError.message,
        };
        overallStatus = "unhealthy";
      } else {
        checks.database = {
          status: "ok",
          responseTime: dbResponseTime,
        };
      }
    } catch (error) {
      checks.database = {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      overallStatus = "unhealthy";
    }

    // Check 2: Storage
    try {
      const { error: storageError } = await supabase.storage.listBuckets();
      if (storageError) {
        checks.storage = {
          status: "error",
          error: storageError.message,
        };
        if (overallStatus === "healthy") overallStatus = "degraded";
      } else {
        checks.storage = {
          status: "ok",
        };
      }
    } catch (error) {
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
    console.error("Erro no health check:", error);
    
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

