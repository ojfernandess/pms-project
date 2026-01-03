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
      console.log("🔄 Executando cancelamento de pré-reservas expiradas...");
      const { data, error } = await supabase.rpc("cancel_expired_preregistrations");

      if (error) {
        console.error("❌ Erro ao cancelar pré-reservas expiradas:", error);
        throw error;
      }

      const count = data as number;
      console.log(`📊 Resultado: ${count} pré-reserva(s) cancelada(s)`);
      return count;
    },
    onSuccess: (cancelledCount) => {
      if (cancelledCount > 0) {
        console.log(`✅ ${cancelledCount} pré-reserva(s) expirada(s) cancelada(s) automaticamente`);
        // Invalidar queries de reservas para atualizar a lista
        queryClient.invalidateQueries({ queryKey: ["reservations"] });
        queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
        
        toast.success(`${cancelledCount} pré-reserva(s) expirada(s) cancelada(s) automaticamente`);
      } else {
        console.log("ℹ️ Nenhuma pré-reserva expirada encontrada");
      }
    },
    onError: (error: any) => {
      console.error("❌ Erro ao cancelar pré-reservas expiradas:", error);
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

  // Função de teste para verificar pré-reservas expiradas
  const testExpired = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("test_expired_preregistrations");
      if (error) {
        console.error("Erro ao testar pré-reservas expiradas:", error);
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      console.log("📋 Pré-reservas com expiration_date:", data);
      if (data && data.length > 0) {
        const expired = data.filter((r: any) => r.is_expired);
        console.log(`⏰ Total: ${data.length}, Expiradas: ${expired.length}`);
        if (expired.length > 0) {
          console.log("🔴 Pré-reservas expiradas:", expired);
        } else {
          console.log("ℹ️ Nenhuma pré-reserva expirada encontrada");
          console.log("📅 Todas as pré-reservas:", data);
        }
      } else {
        console.log("⚠️ Nenhuma pré-reserva com expiration_date encontrada");
      }
    },
  });

  // Função de debug melhorada
  const debugExpired = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("debug_expired_preregistrations");
      if (error) {
        console.error("Erro ao debugar pré-reservas expiradas:", error);
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      console.log("🔍 Debug detalhado de pré-reservas:", data);
      if (data && data.length > 0) {
        data.forEach((r: any) => {
          console.log(`📌 ${r.reservation_code}:`, {
            expiration: r.expiration_date_text,
            now: r.now_time_text,
            expired: r.is_expired,
            diff: r.time_diff_text,
            diffSeconds: r.time_diff_seconds
          });
        });
      }
    },
  });

  return {
    cancelExpired: cancelExpired.mutate,
    isCancelling: cancelExpired.isPending,
    expiredPreregistrations: expiredPreregistrations || [],
    isLoading,
    testExpired: testExpired.mutate,
    testData: testExpired.data,
    debugExpired: debugExpired.mutate,
    debugData: debugExpired.data,
  };
};

