/**
 * Hook para verificar se as migrations de no-show foram aplicadas
 * Verifica:
 * 1. Se a função RPC process_no_shows existe
 * 2. Se a tabela no_show_schedule_config existe
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface MigrationStatus {
  rpcFunctionExists: boolean;
  scheduleTableExists: boolean;
  isLoading: boolean;
  allMigrationsApplied: boolean;
}

export const useNoShowMigrations = (): MigrationStatus => {
  // Verificar se a função RPC existe
  const { data: rpcExists, isLoading: rpcLoading } = useQuery({
    queryKey: ["no_show_migrations", "rpc_function"],
    queryFn: async () => {
      try {
        // Tentar chamar a função RPC com parâmetros nulos para verificar se existe
        const { error } = await supabase.rpc("process_no_shows", {
          p_establishment_id: null,
        });

        // Se não houver erro, a função existe e foi executada
        if (!error) {
          return true;
        }

        // PGRST202 = função não encontrada no schema cache
        // Verificar também mensagens de erro comuns
        const errorMessage = error.message?.toLowerCase() || "";
        const isFunctionNotFound = 
          error.code === "PGRST202" ||
          errorMessage.includes("could not find the function") ||
          errorMessage.includes("function") && errorMessage.includes("does not exist") ||
          errorMessage.includes("no function matches");

        if (isFunctionNotFound) {
          return false;
        }

        // Outros erros (permissão, validação, etc.) indicam que a função existe
        // mas pode ter tido problema na execução, o que significa que ela existe
        return true;
      } catch (error: any) {
        // Se for erro de função não encontrada, retornar false
        const errorMessage = error?.message?.toLowerCase() || "";
        const isFunctionNotFound = 
          error?.code === "PGRST202" ||
          errorMessage.includes("could not find the function") ||
          errorMessage.includes("function") && errorMessage.includes("does not exist") ||
          errorMessage.includes("no function matches");

        if (isFunctionNotFound) {
          return false;
        }
        // Outros erros podem indicar que a função existe
        return true;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  // Verificar se a tabela no_show_schedule_config existe
  const { data: tableExists, isLoading: tableLoading } = useQuery({
    queryKey: ["no_show_migrations", "schedule_table"],
    queryFn: async () => {
      try {
        // Tentar fazer uma query simples na tabela
        const { error } = await supabase
          .from("no_show_schedule_config")
          .select("id")
          .limit(1);

        // Se não houver erro, a tabela existe
        if (!error) {
          return true;
        }

        // PGRST116 = relação não encontrada (tabela não existe)
        // Verificar também mensagens de erro comuns
        const errorMessage = error.message?.toLowerCase() || "";
        const isTableNotFound = 
          error.code === "PGRST116" ||
          errorMessage.includes("does not exist") ||
          errorMessage.includes("relation") && errorMessage.includes("does not exist") ||
          errorMessage.includes("table") && errorMessage.includes("does not exist");

        if (isTableNotFound) {
          return false;
        }

        // Outros erros (permissão, RLS, etc.) indicam que a tabela existe
        // mas pode ter tido problema de acesso, o que significa que ela existe
        return true;
      } catch (error: any) {
        // Se for erro de tabela não encontrada, retornar false
        const errorMessage = error?.message?.toLowerCase() || "";
        const isTableNotFound = 
          error?.code === "PGRST116" ||
          errorMessage.includes("does not exist") ||
          errorMessage.includes("relation") && errorMessage.includes("does not exist") ||
          errorMessage.includes("table") && errorMessage.includes("does not exist");

        if (isTableNotFound) {
          return false;
        }
        // Outros erros podem indicar que a tabela existe
        return true;
      }
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  const isLoading = rpcLoading || tableLoading;
  const rpcFunctionExists = rpcExists ?? false;
  const scheduleTableExists = tableExists ?? false;
  const allMigrationsApplied = rpcFunctionExists && scheduleTableExists;

  return {
    rpcFunctionExists,
    scheduleTableExists,
    isLoading,
    allMigrationsApplied,
  };
};

