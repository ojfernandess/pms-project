import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

export const useSimplifiedPricing = () => {
  const queryClient = useQueryClient();
  const establishmentId = getSelectedEstablishmentId();

  // Buscar tarifários simplificados
  const pricingQuery = useQuery({
    queryKey: ["simplified_pricing", establishmentId],
    queryFn: async () => {
      let query = supabase
        .from("simplified_pricing")
        .select(`
          *,
          pricing_plans (*),
          room_categories (*),
          ota_channels (*)
        `)
        .order("created_at", { ascending: false });

      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }

      const { data, error } = await query;

      if (error) {
        toast.error("Erro ao carregar tarifários");
        throw error;
      }

      return data || [];
    },
    enabled: !!establishmentId,
  });

  // Deletar tarifário
  const deletePricing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("simplified_pricing").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simplified_pricing"] });
      queryClient.invalidateQueries({ queryKey: ["pricing_seasons"] });
      queryClient.invalidateQueries({ queryKey: ["pricing_rules"] });
      toast.success("Tarifário excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir tarifário");
    },
  });

  return {
    pricing: pricingQuery.data || [],
    isLoading: pricingQuery.isLoading,
    refetch: pricingQuery.refetch,
    deletePricing: deletePricing.mutateAsync,
    isDeleting: deletePricing.isPending,
  };
};

