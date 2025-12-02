import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";
import { format, eachDayOfInterval, startOfDay, addDays } from "date-fns";

export interface RatePlan {
  id: string;
  name: string;
  code?: string;
  description?: string;
  plan_type?: string; // Agora é uma string que referencia pricing_plan_types.name
  base_plan_id?: string;
  color?: string;
  is_active: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface RateCalendarEntry {
  id: string;
  establishment_id: string;
  pricing_plan_id: string;
  category_id: string;
  date: string;
  base_price: number;
  adult_price?: number;
  child_price?: number;
  occupancy_percentage?: number;
}

export interface DynamicPricingRule {
  id: string;
  establishment_id: string;
  name: string;
  description?: string;
  trigger_type: 'occupancy' | 'booking_velocity' | 'day_of_week' | 'advance_booking' | 'local_event' | 'custom';
  trigger_condition: any; // JSONB
  adjustment_type: 'percentage' | 'fixed' | 'multiplier';
  adjustment_value: number;
  priority: number;
  is_active: boolean;
  applicable_categories?: string[];
  applicable_plans?: string[];
  start_date?: string;
  end_date?: string;
}

export interface RateRestriction {
  id: string;
  establishment_id: string;
  restriction_type: 'stop_sell' | 'min_los' | 'max_los' | 'cta' | 'ctd' | 'closed_to_arrival' | 'closed_to_departure';
  pricing_plan_id?: string;
  category_id?: string;
  start_date: string;
  end_date: string;
  value?: number;
  notes?: string;
  is_active: boolean;
}

export const useRateSystem = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // ========== RATE PLANS ==========
  const ratePlansQuery = useQuery({
    queryKey: ["rate_plans", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      let query = supabase
        .from("pricing_plans")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as RatePlan[];
    },
  });

  const createRatePlan = useMutation({
    mutationFn: async (plan: Partial<RatePlan>) => {
      const establishmentId = getEstablishmentId();
      const { data, error } = await supabase
        .from("pricing_plans")
        .insert([{ ...plan, establishment_id: establishmentId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_plans"] });
      toast.success("Plano tarifário criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar plano tarifário");
    },
  });

  const updateRatePlan = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<RatePlan>) => {
      const { data, error } = await supabase
        .from("pricing_plans")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_plans"] });
      toast.success("Plano tarifário atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar plano tarifário");
    },
  });

  const deleteRatePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pricing_plans")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_plans"] });
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      toast.success("Plano tarifário excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir plano tarifário");
    },
  });

  // ========== RATE CALENDAR ==========
  const rateCalendarQuery = useQuery({
    queryKey: ["rate_calendar", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("rate_calendar")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("date", { ascending: true });

      if (error) throw error;
      return (data || []) as RateCalendarEntry[];
    },
  });

  const getRateCalendarForPeriod = async (
    planId: string,
    categoryId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RateCalendarEntry[]> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return [];

    const { data, error } = await supabase
      .from("rate_calendar")
      .select("*")
      .eq("establishment_id", establishmentId)
      .eq("pricing_plan_id", planId)
      .eq("category_id", categoryId)
      .gte("date", format(startDate, "yyyy-MM-dd"))
      .lte("date", format(endDate, "yyyy-MM-dd"))
      .order("date", { ascending: true });

    if (error) throw error;
    return (data || []) as RateCalendarEntry[];
  };

  // Buscar preço base da categoria (fallback quando não há entrada no rate_calendar)
  const getCategoryBasePrice = async (categoryId: string): Promise<number> => {
    const { data, error } = await supabase
      .from("room_categories")
      .select("base_price")
      .eq("id", categoryId)
      .single();

    if (error || !data) return 0;
    return Number(data.base_price || 0);
  };

  const upsertRateCalendar = useMutation({
    mutationFn: async (entries: Partial<RateCalendarEntry>[]) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      const entriesWithEstablishment = entries.map(entry => ({
        ...entry,
        establishment_id: establishmentId,
      }));

      const { data, error } = await supabase
        .from("rate_calendar")
        .upsert(entriesWithEstablishment, {
          onConflict: "establishment_id,pricing_plan_id,category_id,date",
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      toast.success("Tarifas atualizadas com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar tarifas");
    },
  });

  const bulkUpdateRates = useMutation({
    mutationFn: async ({
      planId,
      categoryId,
      startDate,
      endDate,
      adjustmentType,
      adjustmentValue,
    }: {
      planId: string;
      categoryId: string;
      startDate: Date;
      endDate: Date;
      adjustmentType: 'percentage' | 'fixed' | 'replace';
      adjustmentValue: number;
    }): Promise<any> => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Buscar tarifas existentes
      const existingRates = await getRateCalendarForPeriod(planId, categoryId, startDate, endDate);
      
      // Buscar preço base da categoria (fallback)
      const categoryBasePrice = await getCategoryBasePrice(categoryId);
      
      const dates = eachDayOfInterval({ start: startDate, end: endDate });

      const entries: Partial<RateCalendarEntry>[] = dates.map(date => {
        const dateStr = format(date, "yyyy-MM-dd");
        const existing = existingRates.find(r => r.date === dateStr);
        
        // Usar preço existente ou preço base da categoria
        let currentPrice: number;
        if (existing && existing.base_price && Number(existing.base_price) > 0) {
          currentPrice = Number(existing.base_price);
        } else {
          currentPrice = categoryBasePrice || 0;
        }

        let newPrice = currentPrice;

        if (adjustmentType === 'percentage') {
          newPrice = currentPrice * (1 + adjustmentValue / 100);
        } else if (adjustmentType === 'fixed') {
          newPrice = currentPrice + adjustmentValue;
        } else if (adjustmentType === 'replace') {
          newPrice = adjustmentValue;
        }

        return {
          pricing_plan_id: planId,
          category_id: categoryId,
          date: dateStr,
          base_price: Math.max(0, newPrice),
        };
      });

      // Usar upsert diretamente ao invés de mutation
      const entriesWithEstablishment = entries.map(entry => ({
        ...entry,
        establishment_id: establishmentId,
      }));

      const { data, error } = await supabase
        .from("rate_calendar")
        .upsert(entriesWithEstablishment, {
          onConflict: "establishment_id,pricing_plan_id,category_id,date",
        })
        .select();

      if (error) throw error;
      
      // Invalidar cache (incluindo establishment_id para garantir)
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      queryClient.invalidateQueries({ queryKey: ["rate_calendar", establishmentId] });
      
      return data;
    },
    onSuccess: () => {
      toast.success("Tarifas atualizadas com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar tarifas");
    },
  });

  // ========== DYNAMIC RULES ==========
  const dynamicRulesQuery = useQuery({
    queryKey: ["dynamic_pricing_rules", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("dynamic_pricing_rules")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as DynamicPricingRule[];
    },
  });

  const createDynamicRule = useMutation({
    mutationFn: async (rule: Partial<DynamicPricingRule>) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      const { data, error } = await supabase
        .from("dynamic_pricing_rules")
        .insert([{ ...rule, establishment_id: establishmentId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      toast.success("Regra dinâmica criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar regra dinâmica");
    },
  });

  const updateDynamicRule = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<DynamicPricingRule>) => {
      const { data, error } = await supabase
        .from("dynamic_pricing_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      toast.success("Regra dinâmica atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar regra dinâmica");
    },
  });

  const deleteDynamicRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("dynamic_pricing_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      toast.success("Regra dinâmica excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir regra dinâmica");
    },
  });

  // ========== RESTRICTIONS ==========
  const restrictionsQuery = useQuery({
    queryKey: ["rate_restrictions", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("rate_restrictions")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("start_date", { ascending: true });

      if (error) throw error;
      return (data || []) as RateRestriction[];
    },
  });

  const createRestriction = useMutation({
    mutationFn: async (restriction: Partial<RateRestriction>) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      const { data, error } = await supabase
        .from("rate_restrictions")
        .insert([{ ...restriction, establishment_id: establishmentId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      toast.success("Restrição criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar restrição");
    },
  });

  const updateRestriction = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<RateRestriction>) => {
      const { data, error } = await supabase
        .from("rate_restrictions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      toast.success("Restrição atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar restrição");
    },
  });

  const deleteRestriction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rate_restrictions")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      toast.success("Restrição excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir restrição");
    },
  });

  // ========== CALCULATE PRICE ==========
  const calculateRatePrice = async (
    categoryId: string,
    planId: string,
    date: Date,
    adults: number = 1,
    children: number = 0
  ): Promise<number> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return 0;

    const { data, error } = await supabase.rpc("calculate_rate_price", {
      p_establishment_id: establishmentId,
      p_category_id: categoryId,
      p_pricing_plan_id: planId,
      p_date: format(date, "yyyy-MM-dd"),
      p_adults: adults,
      p_children: children,
    });

    if (error) {
      console.error("Erro ao calcular preço:", error);
      return 0;
    }

    return Number(data || 0);
  };

  return {
    // Rate Plans
    ratePlans: ratePlansQuery.data || [],
    isLoadingRatePlans: ratePlansQuery.isLoading,
    createRatePlan: createRatePlan.mutateAsync,
    updateRatePlan: updateRatePlan.mutateAsync,
    deleteRatePlan: deleteRatePlan.mutateAsync,

    // Rate Calendar
    rateCalendar: rateCalendarQuery.data || [],
    isLoadingCalendar: rateCalendarQuery.isLoading,
    getRateCalendarForPeriod,
    upsertRateCalendar: upsertRateCalendar.mutateAsync,
    bulkUpdateRates: bulkUpdateRates.mutateAsync,

    // Dynamic Rules
    dynamicRules: dynamicRulesQuery.data || [],
    isLoadingRules: dynamicRulesQuery.isLoading,
    createDynamicRule: createDynamicRule.mutateAsync,
    updateDynamicRule: updateDynamicRule.mutateAsync,
    deleteDynamicRule: deleteDynamicRule.mutateAsync,

    // Restrictions
    restrictions: restrictionsQuery.data || [],
    isLoadingRestrictions: restrictionsQuery.isLoading,
    createRestriction: createRestriction.mutateAsync,
    updateRestriction: updateRestriction.mutateAsync,
    deleteRestriction: deleteRestriction.mutateAsync,

    // Calculate Price
    calculateRatePrice,

    // Loading states
    isLoading: ratePlansQuery.isLoading || rateCalendarQuery.isLoading || dynamicRulesQuery.isLoading || restrictionsQuery.isLoading,
    
    // Refetch functions
    refetch: () => {
      ratePlansQuery.refetch();
      rateCalendarQuery.refetch();
      dynamicRulesQuery.refetch();
      restrictionsQuery.refetch();
    },
  };
};

