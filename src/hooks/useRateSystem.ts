import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";
import { format, eachDayOfInterval, startOfDay, addDays } from "date-fns";
import { logActivity } from "@/lib/activityLogger";

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
      
      // Registrar log de atividade
      await logActivity({
        actionType: "created",
        entityType: "pricing_plan",
        entityId: data.id,
        entityCode: data.code || data.name,
        description: `Plano tarifário "${data.name}" criado`,
        newValues: {
          name: data.name,
          code: data.code,
          plan_type: data.plan_type,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_plans"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Plano tarifário criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar plano tarifário");
    },
  });

  const updateRatePlan = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<RatePlan>) => {
      // Buscar valores antigos antes de atualizar
      const { data: oldData } = await supabase
        .from("pricing_plans")
        .select("*")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("pricing_plans")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      // Registrar log de atividade
      await logActivity({
        actionType: "updated",
        entityType: "pricing_plan",
        entityId: data.id,
        entityCode: data.code || data.name,
        description: `Plano tarifário "${data.name}" atualizado`,
        oldValues: oldData ? {
          name: oldData.name,
          code: oldData.code,
          plan_type: oldData.plan_type,
          is_active: oldData.is_active,
        } : undefined,
        newValues: {
          name: data.name,
          code: data.code,
          plan_type: data.plan_type,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_plans"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Plano tarifário atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar plano tarifário");
    },
  });

  const deleteRatePlan = useMutation({
    mutationFn: async (id: string) => {
      // Buscar dados antes de deletar para o log
      const { data: oldData } = await supabase
        .from("pricing_plans")
        .select("*")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("pricing_plans")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Registrar log de atividade
      if (oldData) {
        await logActivity({
          actionType: "deleted",
          entityType: "pricing_plan",
          entityId: id,
          entityCode: oldData.code || oldData.name,
          description: `Plano tarifário "${oldData.name}" excluído`,
          oldValues: {
            name: oldData.name,
            code: oldData.code,
            plan_type: oldData.plan_type,
            is_active: oldData.is_active,
          },
        });
      }
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

      // Buscar informações das categorias e planos para o log
      const categoryIds = [...new Set(entries.map(e => e.category_id))];
      const planIds = [...new Set(entries.map(e => e.pricing_plan_id))];
      
      const { data: categories } = await supabase
        .from("room_categories")
        .select("id, name")
        .in("id", categoryIds);
      
      const { data: plans } = await supabase
        .from("pricing_plans")
        .select("id, name, code")
        .in("id", planIds);

      const { data, error } = await supabase
        .from("rate_calendar")
        .upsert(entriesWithEstablishment, {
          onConflict: "establishment_id,pricing_plan_id,category_id,date",
        })
        .select();

      if (error) throw error;
      
      // Registrar log de atividade
      const dates = [...new Set(entries.map(e => e.date))].sort();
      const dateRange = dates.length > 0 
        ? dates.length === 1 
          ? dates[0] 
          : `${dates[0]} até ${dates[dates.length - 1]}`
        : "";
      
      const categoryNames = categories?.map(c => c.name).join(", ") || "";
      const planNames = plans?.map(p => p.code || p.name).join(", ") || "";
      
      await logActivity({
        actionType: "updated",
        entityType: "rate_calendar",
        description: `Tarifas atualizadas: ${categoryNames} - ${planNames} (${entries.length} entrada(s), ${dateRange})`,
        newValues: {
          entries_count: entries.length,
          categories: categoryNames,
          plans: planNames,
          date_range: dateRange,
        },
        metadata: {
          categories_count: categoryIds.length,
          plans_count: planIds.length,
          dates_count: dates.length,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
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
      
      // Buscar informações para o log
      const { data: category } = await supabase
        .from("room_categories")
        .select("name")
        .eq("id", categoryId)
        .single();
      
      const { data: plan } = await supabase
        .from("pricing_plans")
        .select("name, code")
        .eq("id", planId)
        .single();
      
      // Registrar log de atividade
      await logActivity({
        actionType: "bulk_updated",
        entityType: "rate_calendar",
        description: `Tarifas atualizadas em lote: ${category?.name || categoryId} - ${plan?.code || plan?.name || planId} (${format(startDate, "dd/MM/yyyy")} até ${format(endDate, "dd/MM/yyyy")})`,
        newValues: {
          adjustment_type: adjustmentType,
          adjustment_value: adjustmentValue,
          category: category?.name,
          plan: plan?.code || plan?.name,
          date_range: `${format(startDate, "dd/MM/yyyy")} até ${format(endDate, "dd/MM/yyyy")}`,
          entries_count: entries.length,
        },
        metadata: {
          category_id: categoryId,
          plan_id: planId,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
        },
      });
      
      // Invalidar cache (incluindo establishment_id para garantir)
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      queryClient.invalidateQueries({ queryKey: ["rate_calendar", establishmentId] });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
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
      
      // Registrar log de atividade
      await logActivity({
        actionType: "created",
        entityType: "dynamic_pricing_rule",
        entityId: data.id,
        entityCode: data.name,
        description: `Regra dinâmica "${data.name}" criada`,
        newValues: {
          name: data.name,
          trigger_type: data.trigger_type,
          adjustment_type: data.adjustment_type,
          adjustment_value: data.adjustment_value,
          priority: data.priority,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Regra dinâmica criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar regra dinâmica");
    },
  });

  const updateDynamicRule = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<DynamicPricingRule>) => {
      // Buscar valores antigos antes de atualizar
      const { data: oldData } = await supabase
        .from("dynamic_pricing_rules")
        .select("*")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("dynamic_pricing_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      // Registrar log de atividade
      await logActivity({
        actionType: "updated",
        entityType: "dynamic_pricing_rule",
        entityId: data.id,
        entityCode: data.name,
        description: `Regra dinâmica "${data.name}" atualizada`,
        oldValues: oldData ? {
          name: oldData.name,
          trigger_type: oldData.trigger_type,
          adjustment_type: oldData.adjustment_type,
          adjustment_value: oldData.adjustment_value,
          priority: oldData.priority,
          is_active: oldData.is_active,
        } : undefined,
        newValues: {
          name: data.name,
          trigger_type: data.trigger_type,
          adjustment_type: data.adjustment_type,
          adjustment_value: data.adjustment_value,
          priority: data.priority,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Regra dinâmica atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar regra dinâmica");
    },
  });

  const deleteDynamicRule = useMutation({
    mutationFn: async (id: string) => {
      // Buscar dados antes de deletar para o log
      const { data: oldData } = await supabase
        .from("dynamic_pricing_rules")
        .select("*")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("dynamic_pricing_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Registrar log de atividade
      if (oldData) {
        await logActivity({
          actionType: "deleted",
          entityType: "dynamic_pricing_rule",
          entityId: id,
          entityCode: oldData.name,
          description: `Regra dinâmica "${oldData.name}" excluída`,
          oldValues: {
            name: oldData.name,
            trigger_type: oldData.trigger_type,
            adjustment_type: oldData.adjustment_type,
            adjustment_value: oldData.adjustment_value,
            priority: oldData.priority,
            is_active: oldData.is_active,
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
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
      
      // Registrar log de atividade
      await logActivity({
        actionType: "created",
        entityType: "rate_restriction",
        entityId: data.id,
        description: `Restrição de tarifa criada: ${data.restriction_type} (${format(new Date(data.start_date), "dd/MM/yyyy")} até ${format(new Date(data.end_date), "dd/MM/yyyy")})`,
        newValues: {
          restriction_type: data.restriction_type,
          start_date: data.start_date,
          end_date: data.end_date,
          value: data.value,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Restrição criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar restrição");
    },
  });

  const updateRestriction = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<RateRestriction>) => {
      // Buscar valores antigos antes de atualizar
      const { data: oldData } = await supabase
        .from("rate_restrictions")
        .select("*")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("rate_restrictions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      // Registrar log de atividade
      await logActivity({
        actionType: "updated",
        entityType: "rate_restriction",
        entityId: data.id,
        description: `Restrição de tarifa atualizada: ${data.restriction_type} (${format(new Date(data.start_date), "dd/MM/yyyy")} até ${format(new Date(data.end_date), "dd/MM/yyyy")})`,
        oldValues: oldData ? {
          restriction_type: oldData.restriction_type,
          start_date: oldData.start_date,
          end_date: oldData.end_date,
          value: oldData.value,
          is_active: oldData.is_active,
        } : undefined,
        newValues: {
          restriction_type: data.restriction_type,
          start_date: data.start_date,
          end_date: data.end_date,
          value: data.value,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Restrição atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar restrição");
    },
  });

  const deleteRestriction = useMutation({
    mutationFn: async (id: string) => {
      // Buscar dados antes de deletar para o log
      const { data: oldData } = await supabase
        .from("rate_restrictions")
        .select("*")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("rate_restrictions")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Registrar log de atividade
      if (oldData) {
        await logActivity({
          actionType: "deleted",
          entityType: "rate_restriction",
          entityId: id,
          description: `Restrição de tarifa excluída: ${oldData.restriction_type} (${format(new Date(oldData.start_date), "dd/MM/yyyy")} até ${format(new Date(oldData.end_date), "dd/MM/yyyy")})`,
          oldValues: {
            restriction_type: oldData.restriction_type,
            start_date: oldData.start_date,
            end_date: oldData.end_date,
            value: oldData.value,
            is_active: oldData.is_active,
          },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
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
    children: number = 0,
    useEdgeFunction: boolean = false
  ): Promise<number> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return 0;

    // Se useEdgeFunction for true, usar Edge Function
    if (useEdgeFunction) {
      try {
        const result = await applyDynamicPricingRules(categoryId, planId, date, adults, children);
        return result.final_price;
      } catch (error) {
        console.error("Erro ao usar Edge Function, usando fallback:", error);
        // Fallback para função PostgreSQL
      }
    }

    // Usar função PostgreSQL (padrão)
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

  // Função para aplicar regras dinâmicas via Edge Function (com informações detalhadas)
  const applyDynamicPricingRules = async (
    categoryId: string,
    planId: string,
    date: Date | string,
    adults: number = 1,
    children: number = 0
  ): Promise<{
    final_price: number;
    base_price: number;
    adjustments_applied: Array<{
      rule_id: string;
      rule_name: string;
      adjustment_type: string;
      adjustment_value: number;
      final_adjustment: number;
    }>;
    auto_apply_enabled: boolean;
    metrics?: {
      occupancy: number;
      pickup_rate: number;
      has_local_event: boolean;
      event_impact: number;
    };
  }> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) {
      throw new Error("Establishment ID não encontrado");
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!supabaseUrl) {
      throw new Error("VITE_SUPABASE_URL não configurado");
    }

    const functionUrl = `${supabaseUrl}/functions/v1/apply-dynamic-pricing-rules`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": session ? `Bearer ${session.access_token}` : "",
      },
      body: JSON.stringify({
        establishment_id: establishmentId,
        category_id: categoryId,
        pricing_plan_id: planId,
        date: format(date, "yyyy-MM-dd"),
        adults,
        children,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Erro desconhecido" }));
      throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`);
    }

    return await response.json();
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
    applyDynamicPricingRules,

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

// Hook para buscar recomendações de preços
export const useRateRecommendations = (startDate: Date, endDate: Date, categoryId?: string) => {
  const { selectedEstablishment } = useEstablishment();
  
  return useQuery({
    queryKey: ["rate_recommendations", selectedEstablishment?.id, startDate, endDate, categoryId],
    queryFn: async () => {
      if (!selectedEstablishment?.id) return [];

      const { data, error } = await supabase.rpc('generate_rate_recommendations', {
        p_establishment_id: selectedEstablishment.id,
        p_start_date: format(startDate, 'yyyy-MM-dd'),
        p_end_date: format(endDate, 'yyyy-MM-dd'),
        p_category_id: categoryId || null,
      });

      if (error) {
        console.error('Erro ao buscar recomendações:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!selectedEstablishment?.id,
  });
};

// Função para aplicar preço sugerido de uma recomendação
export const applyRecommendationPrice = async (
  establishmentId: string,
  categoryId: string,
  pricingPlanId: string,
  date: Date,
  suggestedPrice: number
): Promise<boolean> => {
  if (!establishmentId) {
    throw new Error('Estabelecimento não selecionado');
  }

  const { data, error } = await supabase.rpc('apply_recommendation_price', {
    p_establishment_id: establishmentId,
    p_category_id: categoryId,
    p_pricing_plan_id: pricingPlanId,
    p_date: format(date, 'yyyy-MM-dd'),
    p_suggested_price: suggestedPrice,
  });

  if (error) {
    console.error('Erro ao aplicar preço sugerido:', error);
    throw error;
  }

  return data === true;
};

