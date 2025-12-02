import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Hook para gerenciar pré-reservas expiradas
 */
export const useExpiredPreregistrations = () => {
  const queryClient = useQueryClient();

  // Função para cancelar pré-reservas expiradas
  const cancelExpired = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("cancel_expired_preregistrations");

      if (error) {
        console.error("Erro ao cancelar pré-reservas expiradas:", error);
        throw error;
      }

      return data as number;
    },
    onSuccess: (cancelledCount) => {
      if (cancelledCount > 0) {
        // Invalidar queries de reservas para atualizar a lista
        queryClient.invalidateQueries({ queryKey: ["reservations"] });
        queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
        
        toast.success(`${cancelledCount} pré-reserva(s) expirada(s) cancelada(s) automaticamente`);
      }
    },
    onError: (error: any) => {
      console.error("Erro ao cancelar pré-reservas expiradas:", error);
      toast.error("Erro ao cancelar pré-reservas expiradas");
    },
  });

  // Buscar pré-reservas expiradas (para exibição)
  const { data: expiredPreregistrations, isLoading } = useQuery({
    queryKey: ["expired_preregistrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("id, reservation_code, expiration_date, checkin_date, checkout_date")
        .eq("status", "preregistration")
        .not("expiration_date", "is", null)
        .lt("expiration_date", new Date().toISOString())
        .order("expiration_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000, // Refetch a cada minuto
  });

  return {
    cancelExpired: cancelExpired.mutate,
    isCancelling: cancelExpired.isPending,
    expiredPreregistrations: expiredPreregistrations || [],
    isLoading,
  };
};

