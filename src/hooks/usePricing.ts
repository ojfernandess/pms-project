import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";
import { format, startOfDay, addDays } from "date-fns";

export const usePricing = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();

  // Obter establishmentId do contexto ou localStorage
  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // Buscar temporadas
  const seasonsQuery = useQuery({
    queryKey: ["pricing_seasons", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      // Buscar planos do estabelecimento primeiro
      let plansQuery = supabase.from("pricing_plans").select("id");
      if (establishmentId) {
        plansQuery = plansQuery.eq("establishment_id", establishmentId);
      }
      const { data: plans } = await plansQuery;
      const planIds = plans?.map((p: any) => p.id) || [];
      
      // Se não há planos, retornar array vazio
      if (planIds.length === 0) return [];
      
      // Buscar temporadas dos planos do estabelecimento
      const { data, error } = await supabase
        .from("pricing_seasons")
        .select("*")
        .in("pricing_plan_id", planIds)
        .order("start_date", { ascending: true });

      if (error) {
        toast.error("Erro ao carregar temporadas");
        throw error;
      }
      return data;
    },
  });

  // Buscar regras de precificação
  const rulesQuery = useQuery({
    queryKey: ["pricing_rules", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      // Buscar planos do estabelecimento primeiro
      let plansQuery = supabase.from("pricing_plans").select("id");
      if (establishmentId) {
        plansQuery = plansQuery.eq("establishment_id", establishmentId);
      }
      const { data: plans } = await plansQuery;
      const planIds = plans?.map((p: any) => p.id) || [];
      
      // Se não há planos, retornar array vazio
      if (planIds.length === 0) return [];
      
      // Buscar regras dos planos do estabelecimento
      const { data, error } = await supabase
        .from("pricing_rules")
        .select(`
          *,
          room_categories (*),
          pricing_seasons (*)
        `)
        .in("pricing_plan_id", planIds)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar regras de precificação");
        throw error;
      }
      return data;
    },
  });

  // Buscar promoções
  const promotionsQuery = useQuery({
    queryKey: ["promotions", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      // Buscar planos do estabelecimento primeiro
      let plansQuery = supabase.from("pricing_plans").select("id");
      if (establishmentId) {
        plansQuery = plansQuery.eq("establishment_id", establishmentId);
      }
      const { data: plans } = await plansQuery;
      const planIds = plans?.map((p: any) => p.id) || [];
      
      // Se não há planos, retornar array vazio
      if (planIds.length === 0) return [];
      
      // Buscar promoções dos planos do estabelecimento
      const { data, error } = await supabase
        .from("promotions")
        .select("*")
        .in("pricing_plan_id", planIds)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar promoções");
        throw error;
      }
      return data;
    },
  });

  // Criar temporada
  const createSeason = useMutation({
    mutationFn: async (season: any) => {
      const { data, error } = await supabase
        .from("pricing_seasons")
        .insert([season])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_seasons"] });
      toast.success("Temporada criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar temporada");
    },
  });

  // Atualizar temporada
  const updateSeason = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("pricing_seasons")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_seasons"] });
      toast.success("Temporada atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar temporada");
    },
  });

  // Deletar temporada
  const deleteSeason = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pricing_seasons")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_seasons"] });
      toast.success("Temporada excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir temporada");
    },
  });

  // Criar regra
  const createRule = useMutation({
    mutationFn: async (rule: any) => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .insert([rule])
        .select(`
          *,
          room_categories (*),
          pricing_seasons (*)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_rules"] });
      toast.success("Regra criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar regra");
    },
  });

  // Atualizar regra
  const updateRule = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("pricing_rules")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          room_categories (*),
          pricing_seasons (*)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_rules"] });
      toast.success("Regra atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar regra");
    },
  });

  // Deletar regra
  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("pricing_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pricing_rules"] });
      toast.success("Regra excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir regra");
    },
  });

  // Criar promoção
  const createPromotion = useMutation({
    mutationFn: async (promotion: any) => {
      const { data, error } = await supabase
        .from("promotions")
        .insert([promotion])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Promoção criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar promoção");
    },
  });

  // Atualizar promoção
  const updatePromotion = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("promotions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Promoção atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar promoção");
    },
  });

  // Deletar promoção
  const deletePromotion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("promotions")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions"] });
      toast.success("Promoção excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir promoção");
    },
  });

  // Calcular preço dinâmico usando o novo sistema tarifário
  const calculatePrice = async (
    categoryId: string,
    checkinDate: string,
    checkoutDate: string,
    promotionCode?: string,
    pricingPlanId?: string,
    channelType?: string,
    adults: number = 1,
    children: number = 0
  ): Promise<number> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) {
      console.error("Establishment ID não encontrado");
      return 0;
    }

    // Usar o novo sistema tarifário (calculate_rate_price)
    // Se não tiver pricingPlanId, buscar o plano padrão (BAR)
    let planId = pricingPlanId;
    if (!planId) {
      try {
        // Buscar plano BAR
        const { data: defaultPlan, error: defaultError } = await supabase
          .from("pricing_plans")
          .select("id")
          .eq("establishment_id", establishmentId)
          .eq("code", "BAR")
          .maybeSingle();
        
        if (defaultPlan && !defaultError) {
          planId = defaultPlan.id;
        } else {
          // Se não encontrar BAR, pegar o primeiro plano disponível
          const { data: allPlans, error: plansError } = await supabase
            .from("pricing_plans")
            .select("id")
            .eq("establishment_id", establishmentId)
            .limit(1);
          
          if (allPlans && allPlans.length > 0 && !plansError) {
            planId = allPlans[0].id;
          }
        }
      } catch (err) {
        console.warn("Erro ao buscar plano tarifário:", err);
        // Continuar sem planId, usar fallback
      }
    }

    if (!planId) {
      console.warn("Nenhum plano tarifário encontrado, usando preço base da categoria");
      // Fallback: calcular preço base simples
      const { data: category } = await supabase
        .from("room_categories")
        .select("base_price")
        .eq("id", categoryId)
        .single();

      if (category) {
        // Parse das datas usando timezone local para evitar problemas
        const [checkinYear, checkinMonth, checkinDay] = checkinDate.split('-').map(Number);
        const [checkoutYear, checkoutMonth, checkoutDay] = checkoutDate.split('-').map(Number);
        const checkin = startOfDay(new Date(checkinYear, checkinMonth - 1, checkinDay));
        const checkout = startOfDay(new Date(checkoutYear, checkoutMonth - 1, checkoutDay));
        const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
        return Number(category.base_price) * nights;
      }
      return 0;
    }

    // Calcular preço para cada noite usando o novo sistema
    // Parse das datas usando timezone local para evitar problemas
    const [checkinYear, checkinMonth, checkinDay] = checkinDate.split('-').map(Number);
    const [checkoutYear, checkoutMonth, checkoutDay] = checkoutDate.split('-').map(Number);
    const checkin = startOfDay(new Date(checkinYear, checkinMonth - 1, checkinDay));
    const checkout = startOfDay(new Date(checkoutYear, checkoutMonth - 1, checkoutDay));
    const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
    
    if (nights <= 0) {
      console.warn("Número de noites inválido:", nights);
      return 0;
    }
    
    let totalPrice = 0;
    let hasError = false;
    
    // Buscar preço base da categoria como fallback (com tratamento de erro)
    let basePrice = 0;
    try {
      const { data: category, error: categoryError } = await supabase
        .from("room_categories")
        .select("base_price")
        .eq("id", categoryId)
        .maybeSingle();
      
      if (categoryError) {
        console.warn("Erro ao buscar preço base da categoria:", categoryError);
        // Continuar com basePrice = 0, será tratado abaixo
      } else {
        basePrice = category ? Number(category.base_price || 0) : 0;
      }
    } catch (err: any) {
      // Se for erro de rede, usar fallback silenciosamente
      if (err.message?.includes("Failed to fetch") || 
          err.message?.includes("ERR_INSUFFICIENT_RESOURCES") ||
          err.message?.includes("502")) {
        console.warn("Erro de rede ao buscar preço base, usando valor padrão");
      } else {
        console.warn("Erro ao buscar preço base da categoria:", err);
      }
    }
    
    // Se não tem preço base, retornar 0
    if (basePrice === 0) {
      console.warn("Preço base da categoria é 0, não é possível calcular");
      return 0;
    }

    for (let i = 0; i < nights; i++) {
      // Usar addDays para garantir que a data seja calculada corretamente no timezone local
      const currentDate = startOfDay(addDays(checkin, i));
      const dateStr = format(currentDate, "yyyy-MM-dd");
      
      try {
        try {
          const { data, error } = await supabase.rpc("calculate_rate_price", {
            p_establishment_id: establishmentId,
            p_category_id: categoryId,
            p_pricing_plan_id: planId,
            p_date: dateStr,
            p_adults: adults,
            p_children: children,
          });

          if (error) {
            console.error(`Erro ao calcular preço para ${dateStr}:`, error);
            hasError = true;
            // Usar preço base como fallback
            totalPrice += basePrice;
          } else {
            const price = Number(data || 0);
            if (price > 0) {
              totalPrice += price;
            } else {
              // Se retornou 0, usar preço base
              totalPrice += basePrice;
            }
          }
        } catch (rpcError: any) {
          // Capturar erros de rede/CORS/502 e usar fallback silenciosamente
          const isNetworkError = 
            rpcError.message?.includes("CORS") || 
            rpcError.message?.includes("Failed to fetch") || 
            rpcError.message?.includes("502") ||
            rpcError.message?.includes("Bad Gateway") ||
            rpcError.message?.includes("ERR_INSUFFICIENT_RESOURCES") ||
            rpcError.code === "PGRST301" || // Erro de RLS ou função não encontrada
            rpcError.code === "PGRST116" || // Função não encontrada
            (rpcError.error && (rpcError.error.code === "PGRST301" || rpcError.error.code === "PGRST116"));
          
          if (isNetworkError) {
            // Usar preço base como fallback silenciosamente (não logar como erro)
            totalPrice += basePrice;
            hasError = true;
          } else {
            // Apenas logar erros não relacionados a rede
            console.error(`Erro ao chamar RPC calculate_rate_price para ${dateStr}:`, rpcError);
            totalPrice += basePrice;
            hasError = true;
          }
        }
      } catch (err: any) {
        // Tratar erros de rede silenciosamente
        const isNetworkError = 
          err.message?.includes("Failed to fetch") || 
          err.message?.includes("ERR_INSUFFICIENT_RESOURCES") ||
          err.message?.includes("502") ||
          err.message?.includes("CORS");
        
        if (!isNetworkError) {
          console.error(`Erro ao calcular preço para ${dateStr}:`, err);
        }
        hasError = true;
        totalPrice += basePrice;
      }
    }

    // Garantir que sempre retorne um valor válido
    if (totalPrice === 0 && basePrice > 0) {
      // Se por algum motivo o total é 0, usar cálculo simples
      return basePrice * nights;
    }

    return totalPrice > 0 ? totalPrice : 0;
  };

  // Validar código de promoção
  const validatePromotionCode = async (
    code: string,
    categoryId: string,
    checkinDate: string,
    checkoutDate: string
  ): Promise<{ valid: boolean; discount?: number; message?: string }> => {
    // Parse das datas usando timezone local para evitar problemas
    const [checkinYear, checkinMonth, checkinDay] = checkinDate.split('-').map(Number);
    const [checkoutYear, checkoutMonth, checkoutDay] = checkoutDate.split('-').map(Number);
    const checkin = startOfDay(new Date(checkinYear, checkinMonth - 1, checkinDay));
    const checkout = startOfDay(new Date(checkoutYear, checkoutMonth - 1, checkoutDay));
    const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

    const { data, error } = await supabase
      .from("promotions")
      .select("*")
      .eq("code", code)
      .eq("is_active", true)
      .lte("start_date", checkinDate)
      .gte("end_date", checkoutDate)
      .or(`usage_limit.is.null,usage_count.lt.usage_limit`)
      .single();

    if (error || !data) {
      return { valid: false, message: "Código de promoção inválido" };
    }

    // Verificar categorias aplicáveis
    if (data.applicable_categories && data.applicable_categories.length > 0) {
      if (!data.applicable_categories.includes(categoryId)) {
        return { valid: false, message: "Promoção não aplicável a esta categoria" };
      }
    }

    // Verificar mínimo/máximo de noites
    if (data.min_stay_nights && nights < data.min_stay_nights) {
      return {
        valid: false,
        message: `Mínimo de ${data.min_stay_nights} noites para esta promoção`,
      };
    }

    if (data.max_stay_nights && nights > data.max_stay_nights) {
      return {
        valid: false,
        message: `Máximo de ${data.max_stay_nights} noites para esta promoção`,
      };
    }

    return { valid: true, discount: Number(data.discount_value) };
  };

  return {
    seasons: seasonsQuery.data || [],
    rules: rulesQuery.data || [],
    promotions: promotionsQuery.data || [],
    isLoading: seasonsQuery.isLoading || rulesQuery.isLoading || promotionsQuery.isLoading,
    refetch: () => {
      seasonsQuery.refetch();
      rulesQuery.refetch();
      promotionsQuery.refetch();
    },
    createSeason: createSeason.mutateAsync,
    updateSeason: updateSeason.mutateAsync,
    deleteSeason: deleteSeason.mutateAsync,
    createRule: createRule.mutateAsync,
    updateRule: updateRule.mutateAsync,
    deleteRule: deleteRule.mutateAsync,
    createPromotion: createPromotion.mutateAsync,
    updatePromotion: updatePromotion.mutateAsync,
    deletePromotion: deletePromotion.mutateAsync,
    calculatePrice,
    validatePromotionCode,
    isCreating: createSeason.isPending || createRule.isPending || createPromotion.isPending,
  };
};

