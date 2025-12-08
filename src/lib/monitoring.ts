/**
 * Sistema de Monitoramento e Observabilidade
 * 
 * Este serviço fornece métricas e monitoramento para garantir
 * estabilidade e uptime de 99%.
 */

import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { logError } from "./errorLogger";

export interface SystemMetrics {
  timestamp: string;
  establishment_id?: string;
  api_response_time?: number;
  database_query_time?: number;
  memory_usage?: number;
  active_users?: number;
  active_reservations?: number;
  error_count?: number;
  uptime?: number;
}

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    database: { status: "ok" | "error"; responseTime?: number; error?: string };
    api: { status: "ok" | "error"; responseTime?: number; error?: string };
    storage: { status: "ok" | "error"; error?: string };
  };
  metrics?: SystemMetrics;
}

/**
 * Coleta métricas do sistema
 */
export async function collectMetrics(): Promise<SystemMetrics | null> {
  try {
    const establishmentId = getSelectedEstablishmentId();
    const startTime = performance.now();

    // Testar conexão com banco
    const dbStartTime = performance.now();
    const { error: dbError } = await supabase.from("establishments").select("id").limit(1);
    const dbResponseTime = performance.now() - dbStartTime;

    if (dbError) {
      await logError({
        error: dbError,
        context: "monitoring.collectMetrics",
        severity: "high",
      });
      return null;
    }

    // Coletar métricas adicionais
    const metrics: SystemMetrics = {
      timestamp: new Date().toISOString(),
      establishment_id: establishmentId || undefined,
      database_query_time: Math.round(dbResponseTime),
      api_response_time: Math.round(performance.now() - startTime),
    };

    // Tentar coletar métricas de uso (se disponível)
    if (typeof performance !== "undefined" && (performance as any).memory) {
      metrics.memory_usage = (performance as any).memory.usedJSHeapSize;
    }

    return metrics;
  } catch (error) {
    await logError({
      error,
      context: "monitoring.collectMetrics",
      severity: "medium",
    });
    return null;
  }
}

/**
 * Health check do sistema
 */
export async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: HealthCheckResult["checks"] = {
    database: { status: "error" },
    api: { status: "error" },
    storage: { status: "error" },
  };

  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  // Check 1: Database
  try {
    const dbStartTime = performance.now();
    const { error: dbError } = await supabase.from("establishments").select("id").limit(1);
    const dbResponseTime = performance.now() - dbStartTime;

    if (dbError) {
      checks.database = {
        status: "error",
        error: dbError.message,
      };
      overallStatus = "unhealthy";
    } else {
      checks.database = {
        status: "ok",
        responseTime: Math.round(dbResponseTime),
      };
    }
  } catch (error) {
    checks.database = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
    overallStatus = "unhealthy";
  }

  // Check 2: API (Supabase)
  try {
    const apiStartTime = performance.now();
    const { error: apiError } = await supabase.auth.getSession();
    const apiResponseTime = performance.now() - apiStartTime;

    if (apiError) {
      checks.api = {
        status: "error",
        error: apiError.message,
      };
      if (overallStatus === "healthy") overallStatus = "degraded";
    } else {
      checks.api = {
        status: "ok",
        responseTime: Math.round(apiResponseTime),
      };
    }
  } catch (error) {
    checks.api = {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
    if (overallStatus === "healthy") overallStatus = "degraded";
  }

  // Check 3: Storage (opcional)
  try {
    // Verificar se o storage está acessível
    const { error: storageError } = await supabase.storage.listBuckets();
    if (storageError) {
      checks.storage = {
        status: "error",
        error: storageError.message,
      };
      // Storage não é crítico, apenas degrada
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
    // Storage não é crítico
    if (overallStatus === "healthy") overallStatus = "degraded";
  }

  // Coletar métricas se tudo estiver ok
  let metrics: SystemMetrics | undefined;
  if (overallStatus !== "unhealthy") {
    metrics = await collectMetrics() || undefined;
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    metrics,
  };
}

/**
 * Monitora performance de uma operação
 */
export async function monitorOperation<T>(
  operationName: string,
  operation: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  try {
    const result = await operation();
    const duration = performance.now() - startTime;

    // Log se a operação for lenta (> 1 segundo)
    if (duration > 1000) {
      await logError({
        error: new Error(`Operação lenta: ${operationName} levou ${Math.round(duration)}ms`),
        context: "monitoring.slowOperation",
        severity: "low",
        metadata: {
          operation: operationName,
          duration: Math.round(duration),
        },
      });
    }

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    await logError({
      error: error instanceof Error ? error : new Error(String(error)),
      context: `monitoring.operation.${operationName}`,
      severity: "high",
      metadata: {
        operation: operationName,
        duration: Math.round(duration),
      },
    });
    throw error;
  }
}

/**
 * Inicia monitoramento periódico
 */
let monitoringInterval: NodeJS.Timeout | null = null;

export function startMonitoring(intervalMs: number = 60000): void {
  if (monitoringInterval) {
    stopMonitoring();
  }

  monitoringInterval = setInterval(async () => {
    try {
      const health = await performHealthCheck();
      
      if (health.status === "unhealthy") {
        await logError({
          error: new Error("Sistema não saudável detectado"),
          context: "monitoring.healthCheck",
          severity: "critical",
          metadata: health,
        });
      } else if (health.status === "degraded") {
        await logError({
          error: new Error("Sistema com degradação detectada"),
          context: "monitoring.healthCheck",
          severity: "medium",
          metadata: health,
        });
      }
    } catch (error) {
      console.error("Erro no monitoramento periódico:", error);
    }
  }, intervalMs);
}

/**
 * Para monitoramento periódico
 */
export function stopMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}

