import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

/**
 * Hook para buscar planos tarifários disponíveis no motor de reservas para uma categoria
 */
export const usePricingPlansForCategory = (categoryId: string | null) => {
  return useQuery({
    queryKey: ["pricing_plans_for_category", categoryId, getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId || !categoryId) return [];

      // Buscar planos que:
      // 1. Estão disponíveis no motor de reservas
      // 2. Estão ativos
      // 3. Têm a categoria associada
      const { data: plans, error } = await supabase
        .from("pricing_plans")
        .select(`
          *,
          cancellation_policies:cancellation_policy_id(*),
          pricing_plan_categories!inner(
            category_id,
            room_categories:category_id(id, name)
          )
        `)
        .eq("establishment_id", establishmentId)
        .eq("is_active", true)
        .eq("available_in_booking_engine", true)
        .eq("pricing_plan_categories.category_id", categoryId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .limit(2); // Limitar a 2 planos

      if (error) {
        console.error("Erro ao buscar planos tarifários:", error);
        return [];
      }

      return plans || [];
    },
    enabled: !!categoryId && !!getSelectedEstablishmentId(),
  });
};

/**
 * Hook para buscar todos os planos tarifários disponíveis no motor de reservas
 */
export const useAllPricingPlansForBookingEngine = () => {
  return useQuery({
    queryKey: ["all_pricing_plans_booking_engine", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data: plans, error } = await supabase
        .from("pricing_plans")
        .select(`
          *,
          cancellation_policies:cancellation_policy_id(*),
          pricing_plan_categories(
            category_id,
            room_categories:category_id(id, name)
          )
        `)
        .eq("establishment_id", establishmentId)
        .eq("is_active", true)
        .eq("available_in_booking_engine", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("Erro ao buscar planos tarifários:", error);
        return [];
      }

      return plans || [];
    },
    enabled: !!getSelectedEstablishmentId(),
  });
};

