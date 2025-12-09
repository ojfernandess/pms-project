/**
 * Cliente genérico para fazer requisições a APIs configuradas
 * 
 * Este utilitário facilita o uso das configurações de API armazenadas
 * no sistema para fazer requisições a serviços externos.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { logError } from "./errorLogger";

export interface ApiConfig {
  id: string;
  api_name: string;
  api_key?: string;
  api_secret?: string;
  api_url?: string;
  is_active: boolean;
  config?: any;
}

/**
 * Busca configuração de API por nome
 */
export async function getApiConfig(apiName: string): Promise<ApiConfig | null> {
  try {
    const establishmentId = getSelectedEstablishmentId();
    
    const { data, error } = await supabase
      .from("api_settings")
      .select("*")
      .eq("api_name", apiName)
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // Nenhum registro encontrado
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    await logError({
      error: error instanceof Error ? error : new Error(String(error)),
      context: `apiClient.getApiConfig.${apiName}`,
      severity: "medium",
    });
    return null;
  }
}

/**
 * Faz uma requisição HTTP usando configuração de API
 */
export async function apiRequest<T = any>(
  apiName: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const config = await getApiConfig(apiName);

  if (!config) {
    throw new Error(`API "${apiName}" não está configurada ou não está ativa`);
  }

  if (!config.api_url) {
    throw new Error(`URL da API "${apiName}" não está configurada`);
  }

  const url = `${config.api_url.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
  
  // Preparar headers
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Adicionar autenticação se disponível
  if (config.api_key) {
    headers["Authorization"] = `Bearer ${config.api_key}`;
  }

  if (config.api_secret) {
    headers["X-API-Secret"] = config.api_secret;
  }

  // Configurações adicionais do JSON config
  const timeout = config.config?.timeout || 30000; // 30 segundos padrão
  const retry = config.config?.retry || 1;

  let lastError: Error | null = null;

  // Tentar com retry
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `API Error (${response.status}): ${errorText || response.statusText}`
        );
      }

      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        return await response.json();
      } else {
        return (await response.text()) as T;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Se não for erro de aborto e ainda tiver tentativas, continuar
      if (attempt < retry && !(error instanceof Error && error.name === "AbortError")) {
        const delay = config.config?.retry_delay || 1000;
        await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
        continue;
      }
      
      // Última tentativa falhou ou erro de aborto
      break;
    }
  }

  // Log do erro
  await logError({
    error: lastError || new Error("Erro desconhecido na requisição de API"),
    context: `apiClient.apiRequest.${apiName}`,
    severity: "high",
    metadata: {
      api_name: apiName,
      endpoint,
      url,
    },
  });

  throw lastError || new Error("Erro ao fazer requisição à API");
}

/**
 * Hook helper para usar configuração de API em componentes React
 * 
 * NOTA: Este hook deve ser usado apenas em componentes React.
 * Para uso em funções utilitárias, use getApiConfig() diretamente.
 */
export function useApiConfig(apiName: string) {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    getApiConfig(apiName).then((result) => {
      if (mounted) {
        setConfig(result);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [apiName]);

  const isConfigured = !!config && config.is_active;

  return {
    config,
    isLoading,
    isConfigured,
  };
}

