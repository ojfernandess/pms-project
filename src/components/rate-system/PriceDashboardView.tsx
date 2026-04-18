import { useState, useEffect, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { scheduleChannelSyncAfterRateEdit } from "@/lib/channelSyncAfterRates";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { fetchRatesDashboard } from "@/lib/ratesApi";
import { formatCurrency } from "@/lib/reservationUtils";
import { toast } from "sonner";
import { DollarSign, TrendingUp, TrendingDown, RefreshCw, CheckCircle2, AlertCircle, CalendarIcon, X, Save, Download, Upload, RotateCcw } from "lucide-react";
import { format, addDays, differenceInDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Category {
  id: string;
  name: string;
  base_price: number;
}

interface RatePlan {
  id: string;
  name: string;
  code?: string;
  plan_type?: string;
  is_active: boolean;
}

interface PlanType {
  id: string;
  name: string;
  description?: string;
  color?: string;
  is_active: boolean;
}

export const PriceDashboardView = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id ?? getSelectedEstablishmentId();
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [isBasePriceInitialized, setIsBasePriceInitialized] = useState(false);
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(startOfDay(new Date()));
  const [categoryAdjustments, setCategoryAdjustments] = useState<Record<string, number>>({});
  const [ratePlanAdjustments, setRatePlanAdjustments] = useState<Record<string, { adjustment: number; active: boolean }>>({});
  const [planTypeAdjustments, setPlanTypeAdjustments] = useState<Record<string, { adjustment: number; active: boolean }>>({});
  const [activePlanTab, setActivePlanTab] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"plans" | "types">("plans");
  const [isSaving, setIsSaving] = useState(false);
  const [hasSavedAdjustments, setHasSavedAdjustments] = useState(false);
  const [showDynamicRulesWarning, setShowDynamicRulesWarning] = useState(false);
  const [pendingApply, setPendingApply] = useState(false);

  // Configuração de resiliência: retry, refetch ao focar/montar para evitar estado vazio ao voltar à aba
  const dashboardQueryOptions = {
    retry: 3,
    retryDelay: (i: number) => Math.min(1000 * 2 ** i, 8000),
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 60 * 1000,
  };

  // Buscar dados do dashboard via endpoint otimizado (fallback para queries diretas)
  const { data: dashboardData, isLoading: isLoadingDashboard } = useQuery({
    queryKey: ["rates_dashboard", establishmentId],
    ...dashboardQueryOptions,
    queryFn: async () => {
      if (!establishmentId) {
        return { categories: [], ratePlans: [], planTypes: [], hotelSettings: null };
      }
      const apiData = await fetchRatesDashboard(establishmentId);
      if (apiData) {
        return apiData;
      }

      // Fallback: queries Supabase diretas
      const [categoriesRes, ratePlansRes, planTypesRes, hotelSettingsRes] = await Promise.all([
        supabase
          .from("room_categories")
          .select("id, name, base_price")
          .eq("establishment_id", establishmentId)
          .order("name"),
        supabase
          .from("pricing_plans")
          .select("id, name, code, plan_type, is_active")
          .eq("establishment_id", establishmentId)
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name"),
        supabase
          .from("pricing_plan_types")
          .select("id, name, description, color, is_active")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("name"),
        supabase
          .from("hotel_settings")
          .select("rate_system_settings")
          .eq("establishment_id", establishmentId)
          .maybeSingle(),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (ratePlansRes.error) throw ratePlansRes.error;
      if (planTypesRes.error) throw planTypesRes.error;
      if (hotelSettingsRes.error) throw hotelSettingsRes.error;

      return {
        categories: (categoriesRes.data || []) as Category[],
        ratePlans: (ratePlansRes.data || []) as RatePlan[],
        planTypes: (planTypesRes.data || []) as PlanType[],
        hotelSettings: hotelSettingsRes.data,
      };
    },
    enabled: !!establishmentId,
  });

  const categories = dashboardData?.categories ?? [];
  const ratePlans = dashboardData?.ratePlans ?? [];
  const planTypes = dashboardData?.planTypes ?? [];
  const hotelSettings = dashboardData?.hotelSettings ?? null;
  const isLoadingCategories = isLoadingDashboard;
  const isLoadingRatePlans = isLoadingDashboard;
  const isLoadingPlanTypes = isLoadingDashboard;

  // Verificar se auto_apply_dynamic_rules está ativo
  const isDynamicRulesEnabled = useMemo(() => {
    if (!hotelSettings?.rate_system_settings) return false;
    
    const settings = hotelSettings.rate_system_settings;
    const autoApply = settings.auto_apply_dynamic_rules;
    
    if (typeof autoApply === "boolean") {
      return autoApply;
    }
    
    if (typeof autoApply === "string") {
      return autoApply === "true" || autoApply === "1" || autoApply === "True" || autoApply === "TRUE";
    }
    
    return false;
  }, [hotelSettings]);

  // Função para gerar chave única baseada no estabelecimento
  const getStorageKey = useCallback(() => {
    return `price_dashboard_adjustments_${establishmentId}`;
  }, [establishmentId]);

  // Carregar ajustes salvos do localStorage
  const loadSavedAdjustments = useCallback(() => {
    if (!establishmentId) return null;
    try {
      const saved = localStorage.getItem(getStorageKey());
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Erro ao carregar ajustes salvos:", error);
    }
    return null;
  }, [establishmentId, getStorageKey]);

  // Inicializar preço base comum e ajustes quando categorias são carregadas (apenas uma vez)
  useEffect(() => {
    if (categories.length > 0 && !isBasePriceInitialized) {
      // Tentar carregar ajustes salvos primeiro
      const savedAdjustments = loadSavedAdjustments();
      
      if (savedAdjustments?.basePrice !== null && savedAdjustments?.basePrice !== undefined) {
        // Usar preço base salvo
        setBasePrice(savedAdjustments.basePrice);
        setIsBasePriceInitialized(true);
        
        // Carregar ajustes de categorias salvos (verificar se as categorias ainda existem)
        if (savedAdjustments.categoryAdjustments) {
          const validCategoryAdjustments: Record<string, number> = {};
          categories.forEach((cat) => {
            if (savedAdjustments.categoryAdjustments[cat.id] !== undefined) {
              validCategoryAdjustments[cat.id] = savedAdjustments.categoryAdjustments[cat.id];
            } else {
              // Se a categoria não tinha ajuste salvo, calcular baseado no preço atual
              const prices = categories.map(c => c.base_price).filter(p => p > 0);
              if (prices.length > 0) {
                const minPrice = Math.min(...prices);
                if (minPrice > 0 && cat.base_price > 0) {
                  validCategoryAdjustments[cat.id] = Math.round(((cat.base_price / minPrice) - 1) * 100);
                } else {
                  validCategoryAdjustments[cat.id] = 0;
                }
              } else {
                validCategoryAdjustments[cat.id] = 0;
              }
            }
          });
          setCategoryAdjustments(validCategoryAdjustments);
        } else {
          // Calcular ajustes baseados no preço base comum
          const prices = categories.map(cat => cat.base_price).filter(p => p > 0);
          if (prices.length > 0) {
            const minPrice = Math.min(...prices);
            const adjustments: Record<string, number> = {};
            categories.forEach((cat) => {
              if (minPrice > 0 && cat.base_price > 0) {
                adjustments[cat.id] = Math.round(((cat.base_price / minPrice) - 1) * 100);
              } else {
                adjustments[cat.id] = 0;
              }
            });
            setCategoryAdjustments(adjustments);
          } else {
            const adjustments: Record<string, number> = {};
            categories.forEach((cat) => {
              adjustments[cat.id] = 0;
            });
            setCategoryAdjustments(adjustments);
          }
        }
      } else {
        // Calcular preço base comum usando o menor preço das categorias
        const prices = categories.map(cat => cat.base_price).filter(p => p > 0);
        if (prices.length > 0) {
          // Usar o menor preço como base comum para todas as categorias
          const minPrice = Math.min(...prices);
          setBasePrice(minPrice);
          setIsBasePriceInitialized(true);
          
          // Calcular ajustes baseados no preço base comum (apenas na primeira inicialização)
          const adjustments: Record<string, number> = {};
          categories.forEach((cat) => {
            if (minPrice > 0 && cat.base_price > 0) {
              adjustments[cat.id] = Math.round(((cat.base_price / minPrice) - 1) * 100);
            } else {
              adjustments[cat.id] = 0;
            }
          });
          setCategoryAdjustments(adjustments);
        } else {
          setBasePrice(250);
          setIsBasePriceInitialized(true);
          // Inicializar ajustes como zero apenas se não houver categorias com preço
          const adjustments: Record<string, number> = {};
          categories.forEach((cat) => {
            adjustments[cat.id] = 0;
          });
          setCategoryAdjustments(adjustments);
        }
      }
    }
  }, [categories.length, isBasePriceInitialized, loadSavedAdjustments, categories]);

  // Inicializar ajustes de planos tarifários
  useEffect(() => {
    if (ratePlans.length > 0) {
      // Tentar carregar ajustes salvos primeiro
      const savedAdjustments = loadSavedAdjustments();
      if (savedAdjustments?.ratePlanAdjustments) {
        // Verificar se os planos salvos ainda existem
        const validAdjustments: Record<string, { adjustment: number; active: boolean }> = {};
        ratePlans.forEach((plan) => {
          if (savedAdjustments.ratePlanAdjustments[plan.id]) {
            validAdjustments[plan.id] = savedAdjustments.ratePlanAdjustments[plan.id];
          } else {
            validAdjustments[plan.id] = { adjustment: 0, active: true };
          }
        });
        setRatePlanAdjustments(validAdjustments);
        setHasSavedAdjustments(true);
      } else {
        const adjustments: Record<string, { adjustment: number; active: boolean }> = {};
        ratePlans.forEach((plan) => {
          adjustments[plan.id] = { adjustment: 0, active: true };
        });
        setRatePlanAdjustments(adjustments);
      }
    }
  }, [ratePlans, loadSavedAdjustments]);

  // Inicializar ajustes de tipos de planos tarifários
  useEffect(() => {
    if (planTypes.length > 0) {
      // Tentar carregar ajustes salvos primeiro
      const savedAdjustments = loadSavedAdjustments();
      if (savedAdjustments?.planTypeAdjustments) {
        // Verificar se os tipos salvos ainda existem
        const validAdjustments: Record<string, { adjustment: number; active: boolean }> = {};
        planTypes.forEach((type) => {
          if (savedAdjustments.planTypeAdjustments[type.name]) {
            validAdjustments[type.name] = savedAdjustments.planTypeAdjustments[type.name];
          } else {
            validAdjustments[type.name] = { adjustment: 0, active: true };
          }
        });
        setPlanTypeAdjustments(validAdjustments);
        setHasSavedAdjustments(true);
      } else {
        const adjustments: Record<string, { adjustment: number; active: boolean }> = {};
        planTypes.forEach((type) => {
          adjustments[type.name] = { adjustment: 0, active: true };
        });
        setPlanTypeAdjustments(adjustments);
      }
    }
  }, [planTypes, loadSavedAdjustments]);

  // Salvar ajustes no localStorage
  const saveAdjustments = () => {
    if (!establishmentId) {
      toast.error("Estabelecimento não selecionado");
      return;
    }

    try {
      const adjustmentsToSave = {
        basePrice,
        categoryAdjustments,
        ratePlanAdjustments,
        planTypeAdjustments,
        savedAt: new Date().toISOString(),
        establishmentId,
      };
      localStorage.setItem(getStorageKey(), JSON.stringify(adjustmentsToSave));
      setHasSavedAdjustments(true);
      toast.success("Ajustes salvos com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar ajustes:", error);
      toast.error("Erro ao salvar ajustes");
    }
  };

  // Carregar ajustes salvos
  const loadAdjustments = () => {
    if (!establishmentId) {
      toast.error("Estabelecimento não selecionado");
      return;
    }

    const saved = loadSavedAdjustments();
    if (!saved) {
      toast.info("Nenhum ajuste salvo encontrado");
      return;
    }

    // Carregar preço base
    if (saved.basePrice !== null && saved.basePrice !== undefined) {
      setBasePrice(saved.basePrice);
    }

    // Carregar ajustes de categorias (verificar se as categorias ainda existem)
    if (saved.categoryAdjustments) {
      const validCategoryAdjustments: Record<string, number> = {};
      categories.forEach((cat) => {
        if (saved.categoryAdjustments[cat.id] !== undefined) {
          validCategoryAdjustments[cat.id] = saved.categoryAdjustments[cat.id];
        }
      });
      setCategoryAdjustments(validCategoryAdjustments);
    }

    // Carregar ajustes de planos tarifários (verificar se os planos ainda existem)
    if (saved.ratePlanAdjustments) {
      const validPlanAdjustments: Record<string, { adjustment: number; active: boolean }> = {};
      ratePlans.forEach((plan) => {
        if (saved.ratePlanAdjustments[plan.id]) {
          validPlanAdjustments[plan.id] = saved.ratePlanAdjustments[plan.id];
        } else {
          validPlanAdjustments[plan.id] = { adjustment: 0, active: true };
        }
      });
      setRatePlanAdjustments(validPlanAdjustments);
    }

    // Carregar ajustes de tipos de planos tarifários (verificar se os tipos ainda existem)
    if (saved.planTypeAdjustments) {
      const validTypeAdjustments: Record<string, { adjustment: number; active: boolean }> = {};
      planTypes.forEach((type) => {
        if (saved.planTypeAdjustments[type.name]) {
          validTypeAdjustments[type.name] = saved.planTypeAdjustments[type.name];
        } else {
          validTypeAdjustments[type.name] = { adjustment: 0, active: true };
        }
      });
      setPlanTypeAdjustments(validTypeAdjustments);
    }

    toast.success("Ajustes carregados com sucesso!");
  };

  // Resetar configurações padrão
  const resetToDefaults = () => {
    if (!establishmentId) {
      toast.error("Estabelecimento não selecionado");
      return;
    }

    try {
      // Remover ajustes salvos do localStorage
      localStorage.removeItem(getStorageKey());
      setHasSavedAdjustments(false);

      // Resetar preço base para o menor preço das categorias (ou 250 se não houver)
      const prices = categories.map(cat => cat.base_price).filter(p => p > 0);
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        setBasePrice(minPrice);
      } else {
        setBasePrice(250);
      }

      // Resetar ajustes de categorias para valores calculados baseados no preço base comum
      const currentBasePrice = prices.length > 0 ? Math.min(...prices) : 250;
      const adjustments: Record<string, number> = {};
      categories.forEach((cat) => {
        if (currentBasePrice > 0 && cat.base_price > 0) {
          adjustments[cat.id] = Math.round(((cat.base_price / currentBasePrice) - 1) * 100);
        } else {
          adjustments[cat.id] = 0;
        }
      });
      setCategoryAdjustments(adjustments);

      // Resetar ajustes de planos tarifários para valores padrão
      const planAdjustments: Record<string, { adjustment: number; active: boolean }> = {};
      ratePlans.forEach((plan) => {
        planAdjustments[plan.id] = { adjustment: 0, active: true };
      });
      setRatePlanAdjustments(planAdjustments);

      // Resetar ajustes de tipos de planos tarifários para valores padrão
      const typeAdjustments: Record<string, { adjustment: number; active: boolean }> = {};
      planTypes.forEach((type) => {
        typeAdjustments[type.name] = { adjustment: 0, active: true };
      });
      setPlanTypeAdjustments(typeAdjustments);

      toast.success("Configurações resetadas para os valores padrão!");
    } catch (error) {
      console.error("Erro ao resetar configurações:", error);
      toast.error("Erro ao resetar configurações");
    }
  };

  // Verificar se há ajustes salvos ao carregar
  useEffect(() => {
    if (establishmentId) {
      const saved = loadSavedAdjustments();
      setHasSavedAdjustments(!!saved);
    } else {
      setHasSavedAdjustments(false);
    }
  }, [establishmentId]);

  // Calcular preços por categoria baseado no preço base comum
  const categoryPrices = useMemo(() => {
    const prices: Record<string, number> = {};
    const currentBasePrice = basePrice ?? 250;
    categories.forEach((cat) => {
      const adjustment = categoryAdjustments[cat.id] || 0;
      prices[cat.id] = Math.round(currentBasePrice * (1 + adjustment / 100));
    });
    return prices;
  }, [basePrice, categoryAdjustments, categories]);

  // Calcular preços finais por categoria e plano tarifário
  const finalPrices = useMemo(() => {
    const prices: Record<string, Record<string, number>> = {};
    const currentBasePrice = basePrice ?? 250;
    
    categories.forEach((cat) => {
      prices[cat.id] = {};
      const categoryPrice = categoryPrices[cat.id] || currentBasePrice;
      
      ratePlans.forEach((plan) => {
        const planData = ratePlanAdjustments[plan.id];
        if (planData?.active) {
          let finalPrice = Math.round(categoryPrice * (1 + (planData.adjustment || 0) / 100));
          
          // Aplicar ajuste por tipo de plano se viewMode for "types" e o plano tiver um tipo
          if (viewMode === "types" && plan.plan_type) {
            const typeData = planTypeAdjustments[plan.plan_type];
            if (typeData?.active) {
              finalPrice = Math.round(finalPrice * (1 + (typeData.adjustment || 0) / 100));
            }
          }
          
          prices[cat.id][plan.id] = finalPrice;
        }
      });
    });
    
    return prices;
  }, [categoryPrices, ratePlanAdjustments, planTypeAdjustments, ratePlans, categories, basePrice, viewMode]);

  const handleQuickAdjust = (amount: number) => {
    const currentBasePrice = basePrice ?? 250;
    const newValue = Math.max(50, Math.min(2000, currentBasePrice + amount));
    setBasePrice(newValue);
    // Não resetar ajustes - manter os ajustes configurados pelo usuário
  };

  const handleCategoryAdjustmentChange = (categoryId: string, value: number) => {
    setCategoryAdjustments((prev) => ({
      ...prev,
      [categoryId]: Math.max(-50, Math.min(100, value)),
    }));
  };

  const handleRatePlanAdjustmentChange = (planId: string, value: number) => {
    setRatePlanAdjustments((prev) => ({
      ...prev,
      [planId]: {
        ...prev[planId],
        adjustment: Math.max(-20, Math.min(30, value)),
      },
    }));
  };

  const handleRatePlanToggle = (planId: string, active: boolean) => {
    setRatePlanAdjustments((prev) => ({
      ...prev,
      [planId]: {
        ...prev[planId],
        active,
      },
    }));
  };

  const handlePlanTypeAdjustmentChange = (typeName: string, value: number) => {
    setPlanTypeAdjustments((prev) => ({
      ...prev,
      [typeName]: {
        ...prev[typeName],
        adjustment: Math.max(-20, Math.min(30, value)),
      },
    }));
  };

  const handlePlanTypeToggle = (typeName: string, active: boolean) => {
    setPlanTypeAdjustments((prev) => ({
      ...prev,
      [typeName]: {
        ...prev[typeName],
        active,
      },
    }));
  };

  const handleQuickDateRange = (days: number) => {
    const today = startOfDay(new Date());
    setStartDate(today);
    setEndDate(addDays(today, days - 1));
  };

  // Calcular número de dias
  const daysCount = useMemo(() => {
    return differenceInDays(endDate, startDate) + 1;
  }, [startDate, endDate]);

  // Aplicar preços aos planos tarifários
  const applyPricesMutation = useMutation({
    mutationFn: async () => {
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");
      if (ratePlans.length === 0) throw new Error("Nenhum plano tarifário ativo encontrado");
      if (basePrice === null || basePrice < 50 || basePrice > 2000) {
        throw new Error("Preço base inválido. Deve estar entre R$ 50 e R$ 2000.");
      }

      setIsSaving(true);
      const errors: string[] = [];

      // Gerar array de datas apenas para o período selecionado
      const dates: string[] = [];
      let currentDate = new Date(startDate);
      const end = new Date(endDate);
      
      // Garantir que estamos trabalhando com datas no início do dia
      currentDate = startOfDay(currentDate);
      const endDateStart = startOfDay(end);
      
      while (currentDate <= endDateStart) {
        dates.push(format(currentDate, 'yyyy-MM-dd'));
        currentDate = addDays(currentDate, 1);
      }

      // Validar que temos pelo menos uma data
      if (dates.length === 0) {
        throw new Error("Período de datas inválido. Selecione um período válido.");
      }

      // Atualizar rate_calendar APENAS para o período selecionado
      for (const plan of ratePlans) {
        // Verificar se o plano está ativo nos ajustes
        const planData = ratePlanAdjustments[plan.id];
        if (!planData?.active) {
          continue; // Pular planos inativos
        }

        for (const category of categories) {
          const currentBasePrice = basePrice ?? 250;
          const categoryAdjustment = categoryAdjustments[category.id] || 0;
          const categoryPrice = Math.round(currentBasePrice * (1 + categoryAdjustment / 100));
          
          // Aplicar ajuste do plano tarifário ao preço da categoria
          let finalPrice = Math.round(categoryPrice * (1 + (planData.adjustment || 0) / 100));
          
          // Aplicar ajuste por tipo de plano se viewMode for "types" e o plano tiver um tipo
          if (viewMode === "types" && plan.plan_type) {
            const typeData = planTypeAdjustments[plan.plan_type];
            if (typeData?.active) {
              finalPrice = Math.round(finalPrice * (1 + (typeData.adjustment || 0) / 100));
            }
          }
         
          // Preparar dados para inserção em lote - APENAS para as datas do período selecionado
          const calendarEntries = dates.map((date) => ({
            establishment_id: establishmentId,
            pricing_plan_id: plan.id,
            category_id: category.id,
            date,
            base_price: finalPrice,
          }));

          // Usar upsert para atualizar ou criar entradas APENAS para o período selecionado
          const { error: calendarError } = await supabase
            .from("rate_calendar")
            .upsert(calendarEntries, {
              onConflict: "establishment_id,pricing_plan_id,category_id,date",
            });

          if (calendarError) {
            errors.push(`Erro ao atualizar calendário para ${plan.name} - ${category.name}: ${calendarError.message}`);
          }
        }
      }

      if (errors.length > 0) {
        throw new Error(`Erros ao aplicar preços:\n${errors.join('\n')}`);
      }
    },
    onSuccess: () => {
      const periodText = `${format(startDate, "dd/MM/yyyy", { locale: ptBR })} até ${format(endDate, "dd/MM/yyyy", { locale: ptBR })}`;
      toast.success(`Preços aplicados com sucesso para o período: ${periodText}`);
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      queryClient.invalidateQueries({ queryKey: ["room_categories"] });
      queryClient.invalidateQueries({ queryKey: ["rate_system_categories"] });
      queryClient.invalidateQueries({ queryKey: ["rates_dashboard", establishmentId] });
      scheduleChannelSyncAfterRateEdit(establishmentId ?? null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao aplicar preços");
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

  const handleApplyPrices = () => {
    if (ratePlans.length === 0) {
      toast.error("Nenhum plano tarifário ativo encontrado. Crie um plano tarifário primeiro.");
      return;
    }

    // Verificar se regras dinâmicas estão ativas
    if (isDynamicRulesEnabled) {
      // Mostrar aviso antes de aplicar
      setPendingApply(true);
      setShowDynamicRulesWarning(true);
    } else {
      // Aplicar diretamente se regras dinâmicas não estão ativas
      applyPricesMutation.mutate();
    }
  };

  const confirmApplyPrices = () => {
    setShowDynamicRulesWarning(false);
    if (pendingApply) {
      applyPricesMutation.mutate();
      setPendingApply(false);
    }
  };

  const cancelApplyPrices = () => {
    setShowDynamicRulesWarning(false);
    setPendingApply(false);
  };

  // Evitar exibir "nenhuma categoria/plano" quando a query está desabilitada (sem estabelecimento)
  // ou ainda carregando pela primeira vez ao voltar para a aba
  const isWaitingEstablishment = !establishmentId;
  const isInitialLoad = isLoadingDashboard && !dashboardData;
  if (isWaitingEstablishment || isInitialLoad || isLoadingCategories || isLoadingRatePlans || isLoadingPlanTypes) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 rounded-lg bg-muted/50 animate-pulse" />
          <div className="h-64 rounded-lg bg-muted/50 animate-pulse" />
        </div>
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">
            {isWaitingEstablishment ? "Selecione um estabelecimento..." : "Carregando tarifas..."}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com controles de data e preço base */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Dashboard de Preços</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Data Início */}
            <div className="space-y-2">
              <Label htmlFor="start-date">Data Início:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="start-date"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(startOfDay(date))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Data Fim */}
            <div className="space-y-2">
              <Label htmlFor="end-date">Data Fim:</Label>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="end-date"
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => date && setEndDate(startOfDay(date))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickDateRange(1)}
                  className="whitespace-nowrap"
                >
                  {daysCount} dias
                </Button>
              </div>
            </div>

             {/* Preço Base */}
             <div className="space-y-2">
               <Label htmlFor="base-price">$ Preço Base:</Label>
               <div className="relative">
                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">R$</span>
                 <Input
                   id="base-price"
                   type="text"
                   inputMode="decimal"
                   value={basePrice !== null ? basePrice.toString() : ''}
                   onChange={(e) => {
                     const value = e.target.value.trim();
                     
                     // Permitir campo vazio durante a digitação
                     if (value === '') {
                       setBasePrice(null);
                       return;
                     }
                     
                     // Remover caracteres não numéricos exceto ponto e vírgula
                     let cleanValue = value.replace(/[^\d.,]/g, '');
                     
                     // Substituir vírgula por ponto
                     cleanValue = cleanValue.replace(',', '.');
                     
                     // Permitir apenas um ponto decimal
                     const parts = cleanValue.split('.');
                     if (parts.length > 2) {
                       cleanValue = parts[0] + '.' + parts.slice(1).join('');
                     }
                     
                     // Se não tiver nenhum número, não fazer nada
                     if (cleanValue === '' || cleanValue === '.') {
                       return;
                     }
                     
                     // Converter para número
                     const numValue = parseFloat(cleanValue);
                     
                     // Se for um número válido, atualizar (sem aplicar limites durante digitação)
                     if (!isNaN(numValue) && numValue >= 0) {
                       setBasePrice(numValue);
                     }
                   }}
                   onBlur={(e) => {
                     // Quando sair do campo, garantir que há um valor válido e aplicar limites
                     const value = e.target.value.trim();
                     if (value === '' || !basePrice || basePrice < 50) {
                       setBasePrice(250);
                     } else if (basePrice > 2000) {
                       setBasePrice(2000);
                     } else {
                       // Arredondar para 2 casas decimais
                       setBasePrice(Math.round(basePrice * 100) / 100);
                     }
                   }}
                   className="pl-8"
                   placeholder="250"
                 />
               </div>
             </div>

            {/* Botões de Ajuste Rápido */}
            <div className="space-y-2">
              <Label>Ajuste Rápido:</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdjust(-50)}
                  className="flex-1"
                >
                  -50
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdjust(-10)}
                  className="flex-1"
                >
                  -10
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdjust(10)}
                  className="flex-1"
                >
                  +10
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdjust(50)}
                  className="flex-1"
                >
                  +50
                </Button>
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                onClick={saveAdjustments}
                variant="outline"
                size="lg"
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                Salvar Ajustes
              </Button>
              {hasSavedAdjustments && (
                <Button
                  onClick={loadAdjustments}
                  variant="outline"
                  size="lg"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Carregar Ajustes
                </Button>
              )}
              <Button
                onClick={resetToDefaults}
                variant="outline"
                size="lg"
                className="gap-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
              >
                <RotateCcw className="h-4 w-4" />
                Resetar Padrão
              </Button>
              <Button
                onClick={handleApplyPrices}
                disabled={isSaving || ratePlans.length === 0}
                size="lg"
                className="bg-primary hover:bg-primary/90"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Aplicando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Aplicar Preços
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Aplicar de {format(startDate, "dd/MM/yyyy", { locale: ptBR })} até {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
            </p>
          </div>
          {ratePlans.length === 0 && (
            <p className="text-sm text-destructive mt-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Crie um plano tarifário antes de aplicar preços
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ajustes por Categoria */}
        <Card>
          <div className="p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              % Ajustes por Categoria
            </h3>
            <div className="space-y-4">
               {categories.map((category) => {
                 const adjustment = categoryAdjustments[category.id] || 0;
                 const currentBasePrice = basePrice ?? 250;
                 const price = categoryPrices[category.id] || currentBasePrice;
                
                return (
                  <div key={category.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="w-32 font-medium text-sm truncate" title={category.name}>
                      {category.name}
                    </div>
                    <div className="flex-1">
                      <input
                        type="range"
                        min="-50"
                        max="100"
                        value={adjustment}
                        onChange={(e) => handleCategoryAdjustmentChange(category.id, parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <Input
                      type="number"
                      value={adjustment}
                      onChange={(e) => handleCategoryAdjustmentChange(category.id, parseInt(e.target.value) || 0)}
                      min="-50"
                      max="100"
                      className="w-16 text-center"
                    />
                    <Input
                      type="text"
                      value={`${adjustment}%`}
                      readOnly
                      className="w-16 text-center bg-muted"
                    />
                    <div className="w-24 font-semibold text-primary text-right">
                      {formatCurrency(price)}
                    </div>
                  </div>
                );
              })}
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma categoria encontrada
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Ajustes por Plano Tarifário ou Tipo de Plano */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-primary" />
                % Ajustes por {viewMode === "plans" ? "Plano Tarifário" : "Tipo de Plano"}
              </h3>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === "plans" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("plans")}
                >
                  Planos
                </Button>
                <Button
                  variant={viewMode === "types" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("types")}
                >
                  Tipos
                </Button>
              </div>
            </div>
            
            {viewMode === "plans" ? (
              <>
                <Tabs value={activePlanTab} onValueChange={setActivePlanTab}>
                  <TabsList className="mb-4">
                    <TabsTrigger value="all">Todos</TabsTrigger>
                    {ratePlans.map((plan) => (
                      <TabsTrigger key={plan.id} value={plan.id}>
                        {plan.code || plan.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <div className="space-y-4">
                  {ratePlans.map((plan) => {
                    if (activePlanTab !== "all" && activePlanTab !== plan.id) return null;
                    
                    const planData = ratePlanAdjustments[plan.id] || { adjustment: 0, active: true };
                    
                    return (
                      <div key={plan.id} className="flex items-center gap-3 p-3 border rounded-lg">
                        <Switch
                          checked={planData.active}
                          onCheckedChange={(checked) => handleRatePlanToggle(plan.id, checked)}
                        />
                        <div className="w-32 font-medium text-sm">
                          {plan.code || plan.name}
                        </div>
                        <div className="flex-1">
                          <input
                            type="range"
                            min="-20"
                            max="30"
                            value={planData.adjustment}
                            onChange={(e) => handleRatePlanAdjustmentChange(plan.id, parseInt(e.target.value))}
                            className={cn(
                              "w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500",
                              "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:cursor-pointer",
                              "[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer",
                              !planData.active && "opacity-50 cursor-not-allowed"
                            )}
                            disabled={!planData.active}
                          />
                        </div>
                        <Input
                          type="number"
                          value={planData.adjustment}
                          onChange={(e) => handleRatePlanAdjustmentChange(plan.id, parseInt(e.target.value) || 0)}
                          min="-20"
                          max="30"
                          className="w-16 text-center"
                          disabled={!planData.active}
                        />
                        <div className="w-16 text-center">
                          <span className={cn(
                            "text-sm font-semibold text-green-600 dark:text-green-500",
                            !planData.active && "opacity-50"
                          )}>
                            {planData.adjustment > 0 && "+"}
                            {planData.adjustment}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {ratePlans.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhum plano tarifário ativo encontrado. Crie um plano tarifário primeiro.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {planTypes.map((type) => {
                  const typeData = planTypeAdjustments[type.name] || { adjustment: 0, active: true };
                  
                  return (
                    <div key={type.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <Switch
                        checked={typeData.active}
                        onCheckedChange={(checked) => handlePlanTypeToggle(type.name, checked)}
                      />
                      <div className="w-32 font-medium text-sm flex items-center gap-2">
                        {type.color && (
                          <div
                            className="w-3 h-3 rounded-full border border-gray-300"
                            style={{ backgroundColor: type.color }}
                          />
                        )}
                        {type.name}
                      </div>
                      <div className="flex-1">
                        <input
                          type="range"
                          min="-20"
                          max="30"
                          value={typeData.adjustment}
                          onChange={(e) => handlePlanTypeAdjustmentChange(type.name, parseInt(e.target.value))}
                          className={cn(
                            "w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500",
                            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500 [&::-webkit-slider-thumb]:cursor-pointer",
                            "[&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-green-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer",
                            !typeData.active && "opacity-50 cursor-not-allowed"
                          )}
                          disabled={!typeData.active}
                        />
                      </div>
                      <Input
                        type="number"
                        value={typeData.adjustment}
                        onChange={(e) => handlePlanTypeAdjustmentChange(type.name, parseInt(e.target.value) || 0)}
                        min="-20"
                        max="30"
                        className="w-16 text-center"
                        disabled={!typeData.active}
                      />
                      <div className="w-16 text-center">
                        <span className={cn(
                          "text-sm font-semibold text-green-600 dark:text-green-500",
                          !typeData.active && "opacity-50"
                        )}>
                          {typeData.adjustment > 0 && "+"}
                          {typeData.adjustment}%
                        </span>
                      </div>
                    </div>
                  );
                })}
                {planTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum tipo de plano tarifário ativo encontrado. Crie um tipo de plano primeiro.
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Preview de Preços */}
      <Card>
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-4">Preview de Preços</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Base</TableHead>
                  {ratePlans.map((plan) => {
                    const planData = ratePlanAdjustments[plan.id];
                    if (!planData?.active) return null;
                    return (
                      <TableHead key={plan.id} className="text-center">
                        {plan.code || plan.name}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
               <TableBody>
                 {categories.map((category) => {
                   const currentBasePrice = basePrice ?? 250;
                   const categoryPrice = categoryPrices[category.id] || currentBasePrice;
                  
                  return (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell>{formatCurrency(categoryPrice)}</TableCell>
                      {ratePlans.map((plan) => {
                        const planData = ratePlanAdjustments[plan.id];
                        if (!planData?.active) return null;
                        
                        const finalPrice = finalPrices[category.id]?.[plan.id];
                        return (
                          <TableCell key={plan.id} className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <span className="font-semibold">{finalPrice ? formatCurrency(finalPrice) : '-'}</span>
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {categories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={ratePlans.length + 2} className="text-center text-muted-foreground py-8">
                      Nenhuma categoria encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      {/* Diálogo de aviso sobre Regras de Precificação Dinâmica */}
      <AlertDialog open={showDynamicRulesWarning} onOpenChange={setShowDynamicRulesWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Regras de Precificação Dinâmica Ativadas
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>
                As <strong>Regras de Precificação Dinâmica</strong> estão ativas no seu estabelecimento.
              </p>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium text-orange-900">
                  ⚠️ Importante:
                </p>
                <ul className="text-sm text-orange-800 space-y-1 list-disc list-inside">
                  <li>Os preços definidos no <strong>Dashboard de Preços</strong> serão aplicados normalmente.</li>
                  <li>As <strong>Regras de Precificação Dinâmica</strong> serão calculadas com base nesses valores aplicados.</li>
                  <li>Os preços finais exibidos podem variar conforme as regras dinâmicas configuradas (ocupação, demanda, etc.).</li>
                </ul>
              </div>
              <p className="text-sm text-muted-foreground pt-2">
                Deseja continuar e aplicar os preços?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelApplyPrices}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmApplyPrices} className="bg-primary hover:bg-primary/90">
              Sim, Aplicar Preços
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
