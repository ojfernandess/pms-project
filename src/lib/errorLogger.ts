/**
 * Sistema de Logging de Erros Estruturado
 * 
 * Este serviço centraliza o logging de erros, garantindo que todos os erros
 * sejam registrados de forma estruturada para análise e monitoramento.
 */

import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export interface ErrorLogParams {
  error: Error | unknown;
  context?: string;
  severity?: ErrorSeverity;
  userId?: string;
  metadata?: Record<string, any>;
  stack?: string;
}

interface ErrorLogEntry {
  id?: string;
  timestamp: string;
  severity: ErrorSeverity;
  error_type: string;
  error_message: string;
  context?: string;
  user_id?: string;
  establishment_id?: string;
  stack_trace?: string;
  metadata?: Record<string, any>;
  user_agent?: string;
  url?: string;
  resolved?: boolean;
}

/**
 * Log de erro estruturado
 * 
 * Registra erros de forma estruturada no banco de dados e no console
 * para facilitar debugging e monitoramento.
 */
export async function logError(params: ErrorLogParams): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const establishmentId = getSelectedEstablishmentId();

    // Extrair informações do erro
    let errorType = "UnknownError";
    let errorMessage = "Erro desconhecido";
    let stackTrace: string | undefined;

    if (params.error instanceof Error) {
      errorType = params.error.constructor.name;
      errorMessage = params.error.message;
      stackTrace = params.error.stack;
    } else if (typeof params.error === "string") {
      errorMessage = params.error;
      errorType = "StringError";
    } else {
      errorMessage = JSON.stringify(params.error);
    }

    const severity = params.severity || "medium";
    const context = params.context || "unknown";
    const userId = params.userId || user?.id;

    // Criar entrada de log
    const logEntry: ErrorLogEntry = {
      timestamp: new Date().toISOString(),
      severity,
      error_type: errorType,
      error_message: errorMessage,
      context,
      user_id: userId,
      establishment_id: establishmentId || undefined,
      stack_trace: stackTrace || params.stack,
      metadata: {
        ...params.metadata,
        userAgent: typeof window !== "undefined" ? window.navigator.userAgent : undefined,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      },
      resolved: false,
    };

    // Log no console com formatação
    const emoji = {
      low: "🔵",
      medium: "🟡",
      high: "🟠",
      critical: "🔴",
    }[severity];

    console.error(
      `${emoji} [${severity.toUpperCase()}] Erro em ${context}:`,
      errorMessage,
      "\nTipo:",
      errorType,
      params.metadata ? "\nMetadata:" : "",
      params.metadata
    );

    if (stackTrace && severity === "critical") {
      console.error("Stack trace:", stackTrace);
    }

    // Tentar salvar no banco de dados (não bloquear se falhar)
    try {
      // Verificar se a tabela error_logs existe
      const { error: insertError } = await supabase
        .from("error_logs")
        .insert([
          {
            severity: logEntry.severity,
            error_type: logEntry.error_type,
            error_message: logEntry.error_message,
            context: logEntry.context,
            user_id: logEntry.user_id,
            establishment_id: logEntry.establishment_id,
            stack_trace: logEntry.stack_trace,
            metadata: logEntry.metadata,
            resolved: false,
          },
        ]);

      if (insertError) {
        // Se a tabela não existir, apenas logar no console
        console.warn("⚠️ Tabela error_logs não encontrada. Criando migration...");
      }
    } catch (dbError) {
      // Não bloquear o fluxo se o log no banco falhar
      console.warn("⚠️ Erro ao salvar log no banco:", dbError);
    }

    // Para erros críticos, também enviar para serviço externo (opcional)
    if (severity === "critical") {
      try {
        // Aqui você pode integrar com serviços como Sentry, LogRocket, etc.
        // Exemplo: await sendToSentry(logEntry);
      } catch (externalError) {
        console.warn("⚠️ Erro ao enviar para serviço externo:", externalError);
      }
    }
  } catch (loggingError) {
    // Fallback: sempre logar no console mesmo se tudo falhar
    console.error("❌ Erro ao fazer log de erro:", loggingError);
    console.error("Erro original:", params.error);
  }
}

/**
 * Wrapper para capturar erros em funções assíncronas
 */
export function withErrorLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: string,
  severity?: ErrorSeverity
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      await logError({
        error,
        context,
        severity,
        metadata: { args: JSON.stringify(args) },
      });
      throw error;
    }
  }) as T;
}

/**
 * Wrapper para capturar erros em funções síncronas
 */
export function withErrorLoggingSync<T extends (...args: any[]) => any>(
  fn: T,
  context: string,
  severity?: ErrorSeverity
): T {
  return ((...args: any[]) => {
    try {
      return fn(...args);
    } catch (error) {
      logError({
        error,
        context,
        severity,
        metadata: { args: JSON.stringify(args) },
      });
      throw error;
    }
  }) as T;
}

/**
 * Log de warning (não é erro, mas merece atenção)
 */
export async function logWarning(
  message: string,
  context?: string,
  metadata?: Record<string, any>
): Promise<void> {
  await logError({
    error: new Error(message),
    context: context || "warning",
    severity: "low",
    metadata,
  });
}

/**
 * Log de informação (para debugging)
 */
export function logInfo(message: string, context?: string, metadata?: Record<string, any>): void {
  if (process.env.NODE_ENV === "development") {
    console.log(`ℹ️ [INFO] ${context || "app"}:`, message, metadata || "");
  }
}

