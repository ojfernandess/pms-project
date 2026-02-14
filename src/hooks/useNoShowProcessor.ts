/**
 * Hook para processar no-shows automaticamente
 * 
 * Este hook pode ser usado em:
 * - Componente que executa periodicamente
 * - Cron job
 * - Edge Function do Supabase
 */

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { processNoShows } from "@/utils/cancellationPolicyService";

export const useNoShowProcessor = () => {
  const queryClient = useQueryClient();

  // Processar no-shows manualmente
  const processMutation = useMutation({
    mutationFn: async (establishmentId?: string) => {
      return await processNoShows(establishmentId);
    },
    onSuccess: (count) => {
      if (count > 0) {
        toast.success(`${count} no-show(s) processado(s) automaticamente`);
        // Invalidar queries de reservas para atualizar a lista
        queryClient.invalidateQueries({ queryKey: ["reservations"] });
      } else {
        toast.info("Nenhum no-show encontrado para processar");
      }
    },
    onError: (error: any) => {
      console.error("Erro ao processar no-shows:", error);
      toast.error("Erro ao processar no-shows automaticamente");
    },
  });

  // Processar usando função RPC do Supabase (mais rápido)
  // Fallback para método via serviço se RPC não estiver disponível
  const processViaRPC = useMutation({
    mutationFn: async (establishmentId?: string) => {
      try {
        const { data, error } = await supabase.rpc("process_no_shows", {
          p_establishment_id: establishmentId || null,
        });

        // Se a função não existir (migration não aplicada), usar método via serviço
        if (error && (error.code === "PGRST202" || error.message?.includes("Could not find the function"))) {
          console.warn("Função RPC process_no_shows não encontrada. Usando método via serviço...");
          return await processNoShows(establishmentId);
        }

        if (error) throw error;
        return data || 0;
      } catch (error: any) {
        // Se RPC falhar, tentar método via serviço como fallback
        if (error.code === "PGRST202" || error.message?.includes("Could not find the function")) {
          console.warn("Função RPC não disponível. Usando método via serviço...");
          return await processNoShows(establishmentId);
        }
        throw error;
      }
    },
    onSuccess: (count) => {
      if (count > 0) {
        toast.success(`${count} no-show(s) processado(s) automaticamente`);
        queryClient.invalidateQueries({ queryKey: ["reservations"] });
      }
    },
    onError: (error: any) => {
      // Se for erro de função não encontrada, não mostrar erro (já tentou fallback)
      if (error.code === "PGRST202" || error.message?.includes("Could not find the function")) {
        console.warn("Função RPC não disponível. Aplicar migration 20251225000016_create_no_show_processor_function.sql");
        return;
      }
      console.error("Erro ao processar no-shows via RPC:", error);
      toast.error("Erro ao processar no-shows");
    },
  });

  return {
    processNoShows: processMutation.mutate,
    processNoShowsViaRPC: processViaRPC.mutate,
    isProcessing: processMutation.isPending || processViaRPC.isPending,
    processedCount: processMutation.data || processViaRPC.data || 0,
  };
};

/**
 * Hook para processar no-shows automaticamente em intervalos
 * Útil para componentes que devem verificar periodicamente
 * Se intervalMinutes for 0 ou negativo, o processamento automático é desabilitado
 */
export const useAutoNoShowProcessor = (intervalMinutes: number = 60) => {
  const { processNoShowsViaRPC, isProcessing } = useNoShowProcessor();
  const establishmentId = getSelectedEstablishmentId();

  // Processar automaticamente em intervalos
  useEffect(() => {
    // Se intervalo for 0 ou negativo, desabilitar processamento automático
    if (intervalMinutes <= 0) {
      return;
    }

    if (isProcessing) return;

    const interval = setInterval(() => {
      processNoShowsViaRPC(establishmentId || undefined);
    }, intervalMinutes * 60 * 1000);

    // Processar imediatamente ao montar
    processNoShowsViaRPC(establishmentId || undefined);

    return () => clearInterval(interval);
  }, [establishmentId, intervalMinutes, isProcessing, processNoShowsViaRPC]);
};

