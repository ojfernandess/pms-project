import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, eachDayOfInterval, startOfDay, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, Filter, Download, Edit2, DollarSign, TrendingUp, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatCurrencyWithoutZeroCents } from "@/lib/reservationUtils";
import { useRateSystem, RatePlan } from "@/hooks/useRateSystem";
import { useRateMetrics } from "@/hooks/useRateMetrics";
import { toast } from "sonner";
import { logSystemActivity } from "@/lib/activityLogger";
import { checkEstablishmentFeatureAccess } from "@/lib/featureAccess";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { RateEditDialog } from "./RateEditDialog";
import { BulkEditDialog } from "./BulkEditDialog";
import { RateMetricsSummary } from "./RateMetricsSummary";
import { CreateRateDialog } from "./CreateRateDialog";

interface RateCalendarGridProps {
  ratePlans: RatePlan[];
  categories: any[];
  selectedCategory: string;
  selectedRatePlan: string;
  startDate: Date;
  onCategoryChange: (category: string) => void;
  onPlanChange: (plan: string) => void;
  onStartDateChange: (date: Date) => void;
}

export const RateCalendarGrid = ({
  ratePlans,
  categories,
  selectedCategory,
  selectedRatePlan,
  startDate,
  onCategoryChange,
  onPlanChange,
  onStartDateChange,
}: RateCalendarGridProps) => {
  const [viewDays, setViewDays] = useState(30);
  const [editingRate, setEditingRate] = useState<{
    planId: string;
    categoryId: string;
    date: Date;
    price?: number;
  } | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [createRateOpen, setCreateRateOpen] = useState(false);
  const [calculatedPrices, setCalculatedPrices] = useState<Map<string, number>>(new Map());
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [lastSavedPrices, setLastSavedPrices] = useState<Map<string, number>>(new Map());
  const [categoryOccupancy, setCategoryOccupancy] = useState<Map<string, number>>(new Map()); // key: categoryId-dateStr, value: occupancy
  const [dynamicPriceKeys, setDynamicPriceKeys] = useState<Set<string>>(new Set()); // Rastrear quais preços foram alterados por regras dinâmicas
  const [hasFeatureAccess, setHasFeatureAccess] = useState<boolean | null>(null); // null = ainda não verificado

  const { selectedEstablishment } = useEstablishment();
  const {
    rateCalendar,
    isLoadingCalendar,
    getRateCalendarForPeriod,
    upsertRateCalendar,
    bulkUpdateRates,
    refetch: refetchRateCalendar,
    calculateRatePrice,
    dynamicRules,
  } = useRateSystem();

  const { getMetricsForDate, calculateOccupancy, calculatePickupRate } = useRateMetrics();

  // Verificar se a empresa tem acesso à funcionalidade de automação de regras dinâmicas
  useEffect(() => {
    const checkAccess = async () => {
      if (!selectedEstablishment?.id) {
        setHasFeatureAccess(false);
        return;
      }

      try {
        const access = await checkEstablishmentFeatureAccess(
          'dynamic_pricing_automation',
          selectedEstablishment.id
        );
        setHasFeatureAccess(access);
      } catch (error) {
        console.error('Erro ao verificar acesso à funcionalidade:', error);
        setHasFeatureAccess(false);
      }
    };

    checkAccess();
  }, [selectedEstablishment?.id]);

  const visibleDates = useMemo(() => {
    return eachDayOfInterval({
      start: startDate,
      end: addDays(startDate, viewDays - 1),
    });
  }, [startDate, viewDays]);

  // Determinar quais planos mostrar
  const activePlansToShow = useMemo(() => {
    if (selectedRatePlan === 'all') {
      return ratePlans.filter(p => p.is_active);
    }
    const plan = ratePlans.find(p => p.id === selectedRatePlan);
    return plan ? [plan] : [];
  }, [selectedRatePlan, ratePlans]);

  // Filtrar rateCalendar para os planos selecionados
  const filteredRateCalendar = useMemo(() => {
    if (selectedRatePlan === 'all') {
      // Mostrar todos os planos ativos
      const activePlanIds = ratePlans.filter(p => p.is_active).map(p => p.id);
      return rateCalendar.filter(r => activePlanIds.includes(r.pricing_plan_id));
    }
    if (!selectedRatePlan) return [];
    return rateCalendar.filter(r => r.pricing_plan_id === selectedRatePlan);
  }, [rateCalendar, selectedRatePlan, ratePlans]);

  const filteredCategories = useMemo(() => {
    if (selectedCategory === 'all') return categories;
    return categories.filter(c => c.id === selectedCategory);
  }, [categories, selectedCategory]);

  // Limpar cache quando o plano mudar
  useEffect(() => {
    setCalculatedPrices(new Map());
    setLastSavedPrices(new Map());
    setIsSavingPrices(false);
    setDynamicPriceKeys(new Set()); // Limpar também os preços dinâmicos
  }, [selectedRatePlan]);

  // Calcular preços quando o plano ou período mudar (apenas para datas sem entrada no calendário)
  useEffect(() => {
    if (!selectedRatePlan || filteredCategories.length === 0 || visibleDates.length === 0) {
      console.log("RateCalendarGrid: Condições não atendidas para calcular preços", {
        selectedRatePlan,
        categoriesCount: filteredCategories.length,
        datesCount: visibleDates.length
      });
      return;
    }

    console.log("RateCalendarGrid: Iniciando cálculo de preços com regras dinâmicas", {
      selectedRatePlan,
      categoriesCount: filteredCategories.length,
      datesCount: visibleDates.length,
      plansCount: activePlansToShow.length
    });

    // Filtrar datas baseado nas regras dinâmicas ativas
    // Se houver regras, calcular apenas para datas dentro do período das regras
    let datesToProcess = visibleDates.slice(0, 14);
    
    if (dynamicRules && dynamicRules.length > 0) {
      // Encontrar o período mínimo e máximo das regras ativas
      const activeRules = dynamicRules.filter(r => r.is_active);
      if (activeRules.length > 0) {
        const minDate = activeRules.reduce((min, rule) => {
          if (!rule.start_date) return min;
          const ruleStart = new Date(rule.start_date);
          return min ? (ruleStart < min ? ruleStart : min) : ruleStart;
        }, null as Date | null);
        
        const maxDate = activeRules.reduce((max, rule) => {
          if (!rule.end_date) return max;
          const ruleEnd = new Date(rule.end_date);
          return max ? (ruleEnd > max ? ruleEnd : max) : max;
        }, null as Date | null);
        
        if (minDate || maxDate) {
          datesToProcess = visibleDates.filter(date => {
            const dateStr = format(date, "yyyy-MM-dd");
            const dateObj = new Date(dateStr);
            
            // Verificar se a data está dentro do período de pelo menos uma regra
            return activeRules.some(rule => {
              const ruleStart = rule.start_date ? new Date(rule.start_date) : null;
              const ruleEnd = rule.end_date ? new Date(rule.end_date) : null;
              
              if (!ruleStart && !ruleEnd) return true; // Regra sem período = válida para todas as datas
              if (ruleStart && dateObj < ruleStart) return false;
              if (ruleEnd && dateObj > ruleEnd) return false;
              return true;
            });
          }).slice(0, 14);
          
          console.log("RateCalendarGrid: Filtrando datas baseado nas regras dinâmicas", {
            totalDates: visibleDates.length,
            filteredDates: datesToProcess.length,
            minDate: minDate ? format(minDate, "yyyy-MM-dd") : null,
            maxDate: maxDate ? format(maxDate, "yyyy-MM-dd") : null
          });
        }
      }
    }
    
    // Limitar cálculo para evitar sobrecarga (apenas primeiras 3 categorias)
    const categoriesToProcess = filteredCategories.slice(0, 3);
    const plansToProcess = selectedRatePlan === 'all' ? activePlansToShow.slice(0, 3) : activePlansToShow;
    
    console.log("RateCalendarGrid: Processando preços", {
      categories: categoriesToProcess.length,
      dates: datesToProcess.length,
      plans: plansToProcess.length
    });

    const calculateMissingPrices = async () => {
        // Inicializar com os preços do rate_calendar para evitar flash
      const newPrices = new Map<string, number>();
      
        // Primeiro, preencher com os valores do rate_calendar OU do cache existente
        for (const plan of plansToProcess) {
          for (const category of categoriesToProcess) {
            for (const date of datesToProcess) {
              const dateStr = format(date, "yyyy-MM-dd");
              const key = `${plan.id}-${category.id}-${dateStr}`;
              
              // Verificar se já está no cache calculado
              const cachedPrice = calculatedPrices.get(key);
              if (cachedPrice && cachedPrice > 0) {
                newPrices.set(key, cachedPrice);
                continue;
              }
              
              // Se não está no cache, usar do rate_calendar
              const rateEntry = filteredRateCalendar.find(
                r => r.pricing_plan_id === plan.id &&
                r.category_id === category.id &&
                r.date === dateStr
              );
              
              if (rateEntry?.base_price && rateEntry.base_price > 0) {
                newPrices.set(key, rateEntry.base_price);
              } else {
                const basePrice = Number(category.base_price) || 0;
                if (basePrice > 0) {
                  newPrices.set(key, basePrice);
                }
              }
            }
          }
        }
        
        // Atualizar o estado imediatamente com os valores do calendário para evitar flash
        setCalculatedPrices(prev => {
          const merged = new Map(prev);
          newPrices.forEach((value, key) => {
            // Só atualizar se não existir ou se for diferente
            if (!merged.has(key) || Math.abs((merged.get(key) || 0) - value) > 0.01) {
              merged.set(key, value);
            }
          });
          return merged;
        });
        
        // Agora calcular os preços com regras dinâmicas
        // Só aplicar se a empresa tiver acesso à funcionalidade
        if (hasFeatureAccess === true) {
          for (const plan of plansToProcess) {
            for (const category of categoriesToProcess) {
              for (const date of datesToProcess) {
              const dateStr = format(date, "yyyy-MM-dd");
              const key = `${plan.id}-${category.id}-${dateStr}`;
              
              // Calcular o preço usando a função para aplicar regras dinâmicas
              // Só atualizar se o preço calculado for diferente do que já está no newPrices
              const currentPrice = newPrices.get(key) || 0;
              
              try {
                console.log(`RateCalendarGrid: Calculando preço para ${category.name} - ${plan.name} em ${dateStr}`);
                const calculatedPrice = await calculateRatePrice(category.id, plan.id, date);
                console.log(`RateCalendarGrid: Preço calculado: R$ ${calculatedPrice.toFixed(2)} para ${category.name} - ${plan.name} em ${dateStr} (atual: R$ ${currentPrice.toFixed(2)})`);
                
                // Verificar se o preço foi alterado pelas regras dinâmicas
                const rateEntry = filteredRateCalendar.find(
                  r => r.pricing_plan_id === plan.id &&
                  r.category_id === category.id &&
                  r.date === dateStr
                );
                const originalPrice = rateEntry?.base_price || Number(category.base_price) || 0;
                const isDynamicPrice = calculatedPrice > 0 && Math.abs(calculatedPrice - originalPrice) > 0.01;
                
                // Só atualizar se o preço calculado for diferente (mais de 0.01 de diferença)
                if (calculatedPrice > 0 && Math.abs(calculatedPrice - currentPrice) > 0.01) {
                  newPrices.set(key, calculatedPrice);
                  console.log(`RateCalendarGrid: Preço atualizado de R$ ${currentPrice.toFixed(2)} para R$ ${calculatedPrice.toFixed(2)}`);
                  
                  // Marcar como preço alterado por regras dinâmicas
                  if (isDynamicPrice) {
                    setDynamicPriceKeys(prev => new Set(prev).add(key));
                  }
                } else if (calculatedPrice > 0 && currentPrice === 0) {
                  // Se não havia preço, usar o calculado
                  newPrices.set(key, calculatedPrice);
                  if (isDynamicPrice) {
                    setDynamicPriceKeys(prev => new Set(prev).add(key));
                  }
                }
                // Se o preço calculado é igual ou menor que 0, manter o que já está no newPrices
              } catch (error) {
                // Se houver erro, manter o preço que já está no newPrices (do rate_calendar)
                console.warn(`Erro ao calcular preço para ${category.name} - ${plan.name} em ${dateStr}:`, error);
                // Não alterar newPrices, já tem o valor do rate_calendar
              }
            }
          }
        }
      } else if (hasFeatureAccess === false) {
        console.log('RateCalendarGrid: Empresa não tem acesso à automação de regras dinâmicas');
      }
      
      console.log(`RateCalendarGrid: Preços calculados armazenados:`, {
        count: newPrices.size,
        prices: Array.from(newPrices.entries()).slice(0, 5) // Mostrar apenas os primeiros 5
      });
      
      // Salvar os preços calculados no rate_calendar para persistir as alterações das regras dinâmicas
      // Apenas se não estiver salvando, houver diferença dos últimos preços salvos E a empresa tiver acesso
      if (!isSavingPrices && newPrices.size > 0 && dynamicRules && dynamicRules.length > 0 && hasFeatureAccess === true) {
        const activeRules = dynamicRules.filter(r => r.is_active);
        if (activeRules.length > 0) {
          // Verificar se há mudança na ocupação E diferença nos preços
          let hasOccupancyChange = false;
          let hasPriceChanges = false;
          
          // Verificar mudanças na ocupação por categoria/data
      for (const category of categoriesToProcess) {
        for (const date of datesToProcess) {
          const dateStr = format(date, "yyyy-MM-dd");
              const occupancyKey = `${category.id}-${dateStr}`;
              const currentOccupancy = categoryOccupancy.get(occupancyKey);
              const previousOccupancy = lastSavedPrices.get(`occupancy-${occupancyKey}`);
              
              if (currentOccupancy !== undefined) {
                if (previousOccupancy === undefined || Math.abs(previousOccupancy - currentOccupancy) > 1) {
                  hasOccupancyChange = true;
                  break;
                }
              }
            }
            if (hasOccupancyChange) break;
          }
          
          // Verificar mudanças nos preços
          for (const [key, price] of newPrices.entries()) {
            const lastSaved = lastSavedPrices.get(key);
            if (lastSaved === undefined || Math.abs(lastSaved - price) > 0.01) {
              hasPriceChanges = true;
              break;
            }
          }
          
          // Só salvar se houver mudança na ocupação E mudança no preço
          if (hasOccupancyChange && hasPriceChanges) {
            console.log('RateCalendarGrid: Ocupação e preços mudaram, salvando...');
            setIsSavingPrices(true);
            try {
              const entriesToSave: Array<{
                pricing_plan_id: string;
                category_id: string;
                date: string;
                base_price: number;
              }> = [];
              
              // Reconstruir as entradas usando os dados que já processamos
              for (const plan of plansToProcess) {
                for (const category of categoriesToProcess) {
                  for (const date of datesToProcess) {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const key = `${plan.id}-${category.id}-${dateStr}`;
                    const calculatedPrice = newPrices.get(key);
                    
                    if (calculatedPrice && calculatedPrice > 0) {
                      // Verificar se o preço no calendário é diferente do calculado
                      const rateEntry = filteredRateCalendar.find(
                        r => r.pricing_plan_id === plan.id &&
                        r.category_id === category.id &&
                        r.date === dateStr
                      );
                      
                      // Só salvar se o preço for diferente do que está no calendário
                      if (!rateEntry || Math.abs(rateEntry.base_price - calculatedPrice) > 0.01) {
                        entriesToSave.push({
                          pricing_plan_id: plan.id,
                          category_id: category.id,
                          date: dateStr,
                          base_price: calculatedPrice,
                        });
                      }
                    }
                  }
                }
              }
              
              if (entriesToSave.length > 0) {
                console.log(`RateCalendarGrid: Salvando ${entriesToSave.length} preços calculados no rate_calendar`);
                await upsertRateCalendar(entriesToSave);
                console.log(`RateCalendarGrid: Preços salvos com sucesso`);
                
                // Registrar logs de atividades para cada preço alterado
                for (const entry of entriesToSave) {
                  const category = categoriesToProcess.find(c => c.id === entry.category_id);
                  const plan = plansToProcess.find(p => p.id === entry.pricing_plan_id);
                  const rateEntry = filteredRateCalendar.find(
                    r => r.pricing_plan_id === entry.pricing_plan_id &&
                    r.category_id === entry.category_id &&
                    r.date === entry.date
                  );
                  const oldPrice = rateEntry?.base_price || 0;
                  
                  if (Math.abs(oldPrice - entry.base_price) > 0.01) {
                    await logSystemActivity({
                      actionType: "dynamic_rule_applied",
                      entityType: "rate_calendar",
                      entityId: rateEntry?.id,
                      description: `Tarifa ajustada por regra dinâmica: ${category?.name || 'Categoria'} - ${plan?.name || 'Plano'} em ${format(new Date(entry.date), "dd/MM/yyyy", { locale: ptBR })}`,
                      oldValues: {
                        base_price: oldPrice,
                        date: entry.date,
                        category_id: entry.category_id,
                        pricing_plan_id: entry.pricing_plan_id,
                      },
                      newValues: {
                        base_price: entry.base_price,
                        date: entry.date,
                        category_id: entry.category_id,
                        pricing_plan_id: entry.pricing_plan_id,
                      },
                      metadata: {
                        applied_by: "dynamic_pricing_rule",
                        rule_count: activeRules.length,
                        occupancy: categoryOccupancy.get(`${entry.category_id}-${entry.date}`) || 0,
                      },
                    });
                  }
                }
                
                // Atualizar o mapa de últimos preços salvos
                setLastSavedPrices(new Map(newPrices));
                
                // Atualizar também as ocupações salvas
                const newOccupancyMap = new Map<string, number>();
                for (const category of categoriesToProcess) {
                  for (const date of datesToProcess) {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const occupancyKey = `${category.id}-${dateStr}`;
                    const occupancy = categoryOccupancy.get(occupancyKey);
                    if (occupancy !== undefined) {
                      newOccupancyMap.set(`occupancy-${occupancyKey}`, occupancy);
                    }
                  }
                }
                setLastSavedPrices(prev => {
                  const updated = new Map(prev);
                  newOccupancyMap.forEach((value, key) => updated.set(key, value));
                  return updated;
                });
                
                // NÃO chamar refetchRateCalendar aqui para evitar loop infinito
                // Os preços serão atualizados na próxima renderização natural
              }
              
              setIsSavingPrices(false);
            } catch (error) {
              console.error('RateCalendarGrid: Erro ao salvar preços calculados:', error);
              setIsSavingPrices(false);
              // Não bloquear a exibição se houver erro ao salvar
            }
          } else {
            if (!hasOccupancyChange) {
              console.log('RateCalendarGrid: Ocupação não mudou, não salvando preços');
            } else if (!hasPriceChanges) {
              console.log('RateCalendarGrid: Preços não mudaram, não salvando');
            }
          }
        }
      }
      
      // Atualizar o estado de forma suave, mesclando com valores existentes para evitar flash
      setCalculatedPrices(prev => {
        const merged = new Map(prev);
        newPrices.forEach((value, key) => {
          // Só atualizar se o valor for diferente (mais de 0.01 de diferença)
          const existingValue = merged.get(key);
          if (existingValue === undefined || Math.abs(existingValue - value) > 0.01) {
            merged.set(key, value);
          }
        });
        return merged;
      });
    };

    // Debounce para evitar muitas chamadas
    const timeoutId = setTimeout(calculateMissingPrices, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedRatePlan, filteredCategories, visibleDates, calculateRatePrice, activePlansToShow, dynamicRules, hasFeatureAccess, filteredRateCalendar]);

  const getRateForDate = async (planId: string, categoryId: string, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const key = `${planId}-${categoryId}-${dateStr}`;
    
    // Primeiro verificar se já está no calculatedPrices (já calculado com regras dinâmicas)
    const cachedPrice = calculatedPrices.get(key);
    if (cachedPrice && cachedPrice > 0) {
      return cachedPrice;
    }
    
    // Se não está no cache, buscar do rate_calendar
    const entry = rateCalendar.find(
      r => r.pricing_plan_id === planId &&
      r.category_id === categoryId &&
      r.date === dateStr
    );
    
    if (entry?.base_price && entry.base_price > 0) {
      return entry.base_price;
    }
    
    // Se não encontrou no calendário, calcular usando a função (com regras dinâmicas)
    const calculatedPrice = await calculateRatePrice(categoryId, planId, date);
    
    // Armazenar no cache para próximas consultas
    if (calculatedPrice > 0) {
      setCalculatedPrices(prev => {
        const updated = new Map(prev);
        updated.set(key, calculatedPrice);
        return updated;
      });
    }
    
    return calculatedPrice || null;
  };

  const handleCellClick = (planId: string, categoryId: string, date: Date) => {
    getRateForDate(planId, categoryId, date).then(price => {
      setEditingRate({
        planId,
        categoryId,
        date,
        price: price || undefined,
      });
    });
  };

  const handleSaveRate = async (data: {
    planId: string;
    categoryId: string;
    date: Date;
    basePrice: number;
    adultPrice?: number;
    childPrice?: number;
  }) => {
    try {
      await upsertRateCalendar([{
        pricing_plan_id: data.planId,
        category_id: data.categoryId,
        date: format(data.date, "yyyy-MM-dd"),
        base_price: data.basePrice,
        adult_price: data.adultPrice,
        child_price: data.childPrice,
      }]);
      setEditingRate(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar tarifa");
    }
  };

  const getOccupancyColor = (occ: number) => {
    if (occ >= 90) return 'bg-red-500';
    if (occ >= 75) return 'bg-orange-500';
    if (occ >= 60) return 'bg-yellow-500';
    if (occ >= 40) return 'bg-green-500';
    return 'bg-blue-500';
  };

  if (!selectedRatePlan) {
    return (
      <Card className="p-8 text-center">
        <p className="text-gray-600">Selecione um plano tarifário para visualizar o calendário</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Label className="mb-1">Plano Tarifário</Label>
            <div className="flex items-center gap-2">
            <Select value={selectedRatePlan} onValueChange={onPlanChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">Todos os Planos</SelectItem>
                {ratePlans.filter(p => p.is_active).map(plan => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} {plan.code && `(${plan.code})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
              {/* Indicador do Plano Selecionado */}
              {selectedRatePlan && selectedRatePlan !== 'all' && (() => {
                const selectedPlan = ratePlans.find(p => p.id === selectedRatePlan);
                if (!selectedPlan) return null;
                
                const planColor = selectedPlan.color || '#6366f1'; // Cor padrão indigo
                
                return (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-200">
                    <div 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: planColor }}
                    />
                    <span className="text-xs font-medium text-gray-700">
                      {selectedPlan.name}
                      {selectedPlan.code && ` (${selectedPlan.code})`}
                    </span>
                  </div>
                );
              })()}
              {selectedRatePlan === 'all' && (
                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-purple-50 border border-purple-200">
                  <div className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-600" />
                  <span className="text-xs font-medium text-purple-700">
                    Todos os Planos ({activePlansToShow.length})
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1">
            <Label className="mb-1">Categoria</Label>
            <Select value={selectedCategory} onValueChange={onCategoryChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 items-end">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "dd 'de' MMMM", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && onStartDateChange(startOfDay(date))}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="icon"
              onClick={() => onStartDateChange(addDays(startDate, -viewDays))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onStartDateChange(addDays(startDate, viewDays))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Select value={viewDays.toString()} onValueChange={(v) => setViewDays(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="60">60 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Download className="h-4 w-4" />
            </Button>
            <Button 
              onClick={() => setCreateRateOpen(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg transition-all duration-200"
            >
              Criar Tarifário
            </Button>
            <Button onClick={() => setBulkEditOpen(true)}>
              Edição em Lote
            </Button>
          </div>
        </div>
      </Card>

      {/* Rate Calendar Grid */}
      <Card className="p-0 overflow-x-auto">
        <div className="min-w-full">
          {/* Indicador do Plano no Topo do Grid */}
          {selectedRatePlan && selectedRatePlan !== 'all' && (() => {
            const selectedPlan = ratePlans.find(p => p.id === selectedRatePlan);
            if (!selectedPlan) return null;
            
            const planColor = selectedPlan.color || '#6366f1';
            
            return (
              <div className="bg-white border-b border-gray-200 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: planColor }}
                  />
                  <span className="text-xs font-medium text-gray-500">Visualizando plano:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {selectedPlan.name}
                  </span>
                  {selectedPlan.code && (
                    <span className="text-xs font-medium text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
                      {selectedPlan.code}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
          {selectedRatePlan === 'all' && (
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-200 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-purple-600" />
                <span className="text-xs font-medium text-purple-700">Visualizando todos os planos:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {activePlansToShow.map((plan, idx) => {
                    const planColor = plan.color || '#6366f1';
                    return (
                      <div key={plan.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-purple-200">
                        <div 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: planColor }}
                        />
                        <span className="text-xs font-medium text-gray-700">
                          {plan.name}
                          {plan.code && ` (${plan.code})`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          
          <div className="bg-slate-100 border-b-2 border-slate-300">
            {/* Header Row */}
            <div className="flex border-b border-slate-200">
              <div className="w-48 sm:w-56 flex-shrink-0 p-2 border-r border-slate-300 bg-slate-200 font-semibold text-xs flex items-center">
                <span>Categoria</span>
              </div>
              <div className="flex-1 flex" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)` }}>
                {visibleDates.map((date) => {
                  const isToday = isSameDay(date, new Date());
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                  return (
                    <div
                      key={date.toISOString()}
                      className={cn(
                        "border-r border-slate-200 last:border-r-0 p-1.5 text-center",
                        isToday && "bg-blue-100",
                        isWeekend && !isToday && "bg-slate-50"
                      )}
                      style={{
                        minWidth: viewDays <= 14 ? '90px' : viewDays <= 30 ? '70px' : viewDays <= 60 ? '50px' : '40px',
                        fontSize: viewDays <= 30 ? '10px' : '9px'
                      }}
                    >
                      <div className="font-bold" style={{ fontSize: viewDays <= 30 ? '11px' : '10px' }}>
                        {viewDays <= 30 ? format(date, "EEE", { locale: ptBR }) : format(date, "EEEEEE", { locale: ptBR })}
                      </div>
                      <div className="text-slate-600 font-medium">
                        {viewDays <= 30 ? format(date, "dd/MM") : format(date, "dd")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Category Rows */}
          <div>
            {filteredCategories.map((category, categoryIndex) => {
              // Se "Todos os Planos" estiver selecionado, mostrar uma linha para cada plano
              const plansToRender = selectedRatePlan === 'all' ? activePlansToShow : activePlansToShow;
              
              return (
                <div key={category.id} className={selectedRatePlan === 'all' ? "mb-8 last:mb-0" : ""}>
                  {/* Card de Categoria quando mostrar todos os planos */}
                  {selectedRatePlan === 'all' && (
                    <div className="mb-4">
                      <div className="bg-gradient-to-r from-white via-slate-50/80 to-white border border-slate-200 rounded-xl shadow-md px-5 py-4 mb-4 relative overflow-hidden">
                        {/* Decorative gradient overlay */}
                        <div 
                          className="absolute top-0 left-0 w-1 h-full opacity-30"
                          style={{ backgroundColor: category.color || '#3B82F6' }}
                        />
                        <div className="flex items-center gap-4 relative z-10">
                          <div 
                            className="w-6 h-6 rounded-lg flex-shrink-0 shadow-lg ring-2 ring-white"
                            style={{ backgroundColor: category.color || '#3B82F6' }}
                          />
                          <div className="flex-1">
                            <div className="font-bold text-gray-900 text-lg">{category.name}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {category.rooms && Array.isArray(category.rooms) ? category.rooms.length : 0} quartos disponíveis
                            </div>
                          </div>
                          <div className="text-xs font-semibold text-gray-600 bg-gradient-to-r from-gray-100 to-gray-50 px-3 py-1.5 rounded-full border border-gray-200 shadow-sm">
                            {plansToRender.length} {plansToRender.length === 1 ? 'plano' : 'planos'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Linhas de Planos para esta Categoria */}
                  <div className={selectedRatePlan === 'all' ? "space-y-2" : ""}>
                    {plansToRender.map((plan, planIndex) => {
                      return (
                        <div 
                          key={`${category.id}-${plan.id}`} 
                          className={cn(
                            "flex border-b border-slate-200 hover:bg-gray-50 transition-all duration-200",
                            selectedRatePlan === 'all' && "border-l-4 rounded-r-lg bg-white shadow-sm hover:shadow-md border-t border-r border-b border-slate-200",
                            selectedRatePlan === 'all' && "ml-1"
                          )} 
                          style={selectedRatePlan === 'all' ? { borderLeftColor: plan.color || '#6366f1' } : {}}
                        >
                        <div className={cn(
                          "w-48 sm:w-56 flex-shrink-0 p-3 border-r border-slate-200",
                          selectedRatePlan === 'all' ? "bg-gradient-to-br from-white via-slate-50/50 to-white" : "bg-white"
                        )}>
                          <div className="flex items-center gap-2.5">
                            {selectedRatePlan !== 'all' && (
                              <div className="w-3 h-3 rounded" style={{ backgroundColor: category.color || '#3B82F6' }}></div>
                            )}
                            <div className="flex-1">
                              {selectedRatePlan !== 'all' && (
                                <div className="font-medium text-gray-900 text-sm">{category.name}</div>
                              )}
                              {selectedRatePlan === 'all' && (
                                <div className="flex items-center gap-2.5">
                                  <div 
                                    className="w-3 h-3 rounded-full flex-shrink-0 shadow-md ring-2 ring-white"
                                    style={{ backgroundColor: plan.color || '#6366f1' }}
                                  />
                                  <div>
                                    <div className="font-bold text-gray-900 text-sm leading-tight">
                                      {plan.name}
                                    </div>
                                    {plan.code && (
                                      <div className="text-xs text-gray-500 font-medium mt-0.5">
                                        {plan.code}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {selectedRatePlan !== 'all' && (
                                <div className="text-xs text-gray-500">
                                  {category.rooms && Array.isArray(category.rooms) ? category.rooms.length : 0} quartos
                                </div>
                              )}
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)` }}>
                  {visibleDates.map((date) => {
                    const dateStr = format(date, "yyyy-MM-dd");
                      // Buscar entrada específica para o plano e categoria
                    const rateEntry = filteredRateCalendar.find(
                        r => r.pricing_plan_id === plan.id &&
                        r.category_id === category.id &&
                      r.date === dateStr
                    );
                    
                      // Determinar preço: sempre usar a função de cálculo para aplicar regras dinâmicas
                      // Primeiro tentar do cache calculado (já aplica regras), depois do calendário, depois base da categoria
                      const cacheKey = `${plan.id}-${category.id}-${dateStr}`;
                      let price = calculatedPrices.get(cacheKey);
                      
                      if (!price || price === 0) {
                        // Se não está no cache, usar do calendário (mas isso não aplica regras dinâmicas)
                        price = rateEntry?.base_price;
                        
                    if (!price || price === 0) {
                        // Fallback: usar preço base da categoria
                        price = Number(category.base_price) || 0;
                      }
                    }
                      
                      // Verificar se este preço foi alterado por regras dinâmicas
                      const isDynamicPrice = dynamicPriceKeys.has(cacheKey);
                      const originalPrice = rateEntry?.base_price || Number(category.base_price) || 0;
                      const isActuallyDynamic = isDynamicPrice && price > 0 && Math.abs(price - originalPrice) > 0.01;
                    
                    // Usar ocupação do rate_calendar ou calcular em tempo real
                    const occupancy = rateEntry?.occupancy_percentage || 0;
                    const projectedOccupancy = rateEntry?.projected_occupancy || 0;
                    const pickupRate = rateEntry?.pickup_rate || 0;
                    const isToday = isSameDay(date, new Date());

                      // Determinar tamanho da fonte baseado no número de dias visíveis
                      const fontSize = viewDays <= 14 ? 'text-sm' : viewDays <= 30 ? 'text-xs' : viewDays <= 60 ? 'text-[10px]' : 'text-[9px]';
                      const cellPadding = viewDays <= 14 ? 'p-2' : viewDays <= 30 ? 'p-1.5' : viewDays <= 60 ? 'p-1' : 'p-0.5';
                      const innerPadding = viewDays <= 14 ? 'p-2' : viewDays <= 30 ? 'p-1.5' : viewDays <= 60 ? 'p-1' : 'p-1';

                    return (
                      <div
                        key={date.toISOString()}
                        className={cn(
                            "border-r border-slate-200 last:border-r-0 text-center cursor-pointer group relative flex items-center justify-center",
                            cellPadding,
                          isToday && "bg-blue-50"
                        )}
                          onClick={() => handleCellClick(plan.id, category.id, date)}
                        style={{
                            minWidth: viewDays <= 14 ? '90px' : viewDays <= 30 ? '70px' : viewDays <= 60 ? '50px' : '40px',
                            minHeight: '60px'
                        }}
                      >
                        <div className={cn(
                          "rounded-lg w-full transition-all duration-500 ease-in-out flex flex-col items-center justify-center",
                          innerPadding,
                          getOccupancyColor(occupancy || projectedOccupancy),
                          "bg-opacity-10 group-hover:bg-opacity-20",
                          isActuallyDynamic && "ring-2 ring-purple-400 ring-opacity-60 bg-purple-50 dark:bg-purple-950/20 shadow-md"
                        )}>
                          <div className={cn(
                            "font-semibold transition-all duration-500 ease-in-out leading-tight break-words",
                            fontSize,
                            isActuallyDynamic ? "text-purple-700 dark:text-purple-300" : "text-gray-900"
                          )}>
                            {formatCurrencyWithoutZeroCents(price)}
                          </div>
                          {(occupancy > 0 || projectedOccupancy > 0) && viewDays <= 60 && (
                            <div className="text-[9px] text-gray-600 mt-0.5 leading-tight">
                              {occupancy > 0 ? `${Math.round(occupancy)}%` : `${Math.round(projectedOccupancy)}%`} occ
                            </div>
                          )}
                          {pickupRate > 0 && viewDays <= 60 && (
                            <div className="text-[9px] text-blue-600 mt-0.5 leading-tight">
                              {pickupRate.toFixed(1)}/dia
                            </div>
                          )}
                        </div>
                        <div className="absolute hidden group-hover:block top-full left-1/2 transform -translate-x-1/2 mt-1 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-20">
                          Clique para editar
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <RateMetricsSummary
        categories={filteredCategories}
        selectedPlan={selectedRatePlan}
        startDate={startDate}
        viewDays={viewDays}
      />

      {/* Edit Rate Dialog */}
      {editingRate && (
        <RateEditDialog
          open={!!editingRate}
          onOpenChange={(open) => !open && setEditingRate(null)}
          planId={editingRate.planId}
          categoryId={editingRate.categoryId}
          date={editingRate.date}
          initialPrice={editingRate.price}
          onSave={handleSaveRate}
        />
      )}

      {/* Create Rate Dialog */}
      <CreateRateDialog
        open={createRateOpen}
        onOpenChange={(open) => {
          setCreateRateOpen(open);
          if (!open) {
            // Refetch quando o dialog fechar para atualizar o grid
            refetchRateCalendar();
          }
        }}
        categories={categories}
        ratePlans={ratePlans}
        onSave={async (data) => {
          // Criar entradas para todas as datas do período
          const dates: string[] = [];
          let currentDate = new Date(data.startDate);
          const end = new Date(data.endDate);

          while (currentDate <= end) {
            dates.push(format(currentDate, "yyyy-MM-dd"));
            currentDate = addDays(currentDate, 1);
          }

          // Criar entradas para todas as datas do período
          const entries = dates.map((date) => ({
            pricing_plan_id: data.planIds[0],
            category_id: data.categoryId,
            date,
            base_price: data.basePrice,
            adult_price: data.adultPrice,
            child_price: data.childPrice,
          }));

          await upsertRateCalendar(entries);
        }}
      />

      {/* Bulk Edit Dialog */}
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selectedPlan={selectedRatePlan}
        categories={filteredCategories}
        ratePlans={ratePlans}
        startDate={startDate}
        endDate={addDays(startDate, viewDays - 1)}
        onSave={async (data) => {
          try {
            // Criar entradas individuais para cada combinação categoria/plano
            const entries: Array<{
              pricing_plan_id: string;
              category_id: string;
              date: string;
              base_price: number;
              adult_price?: number;
              child_price?: number;
            }> = [];

            // Gerar todas as datas do período
            const dates: string[] = [];
            let currentDate = new Date(data.startDate);
            const end = new Date(data.endDate);
            while (currentDate <= end) {
              dates.push(format(currentDate, "yyyy-MM-dd"));
              currentDate = addDays(currentDate, 1);
            }

            // Buscar preços atuais do rate_calendar para calcular os novos valores
            const filteredRateCalendar = rateCalendar.filter(
              r => dates.includes(r.date)
            );

            // Para cada combinação categoria/plano, calcular os novos preços
            for (const item of data.categoryPlans) {
              const category = filteredCategories.find(c => c.id === item.categoryId);
              
              for (const dateStr of dates) {
                // Buscar preço atual
                const existingEntry = filteredRateCalendar.find(
                  r => r.pricing_plan_id === item.planId &&
                  r.category_id === item.categoryId &&
                  r.date === dateStr
                );
                
                let newBasePrice: number;
                const currentPrice = existingEntry?.base_price || Number(category?.base_price) || 0;
                
                // Calcular novo preço baseado no tipo de ajuste
                if (item.adjustmentType === 'percentage') {
                  newBasePrice = currentPrice * (1 + item.adjustmentValue / 100);
                } else if (item.adjustmentType === 'fixed') {
                  newBasePrice = currentPrice + item.adjustmentValue;
                } else { // replace
                  newBasePrice = item.adjustmentValue;
            }
                
                // Garantir que o preço não seja negativo
                if (newBasePrice < 0) {
                  newBasePrice = 0;
                }

                entries.push({
                  pricing_plan_id: item.planId,
                  category_id: item.categoryId,
                  date: dateStr,
                  base_price: newBasePrice,
                  // Manter adult_price e child_price se existirem
                  adult_price: existingEntry?.adult_price,
                  child_price: existingEntry?.child_price,
                });
              }
            }

            if (entries.length > 0) {
              await upsertRateCalendar(entries);
            await refetchRateCalendar();
              toast.success(`${entries.length} tarifário(s) atualizado(s)`);
            } else {
              toast.warning("Nenhuma tarifa para atualizar");
            }
          } catch (error: any) {
            console.error("Erro ao atualizar tarifas em lote:", error);
            toast.error(error.message || "Erro ao atualizar tarifas");
          }
        }}
      />
    </div>
  );
};

