import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import { RatePriceBreakdown } from "./RatePriceBreakdown";
import { useRateSystem, RatePlan, type RateCalendarEntry } from "@/hooks/useRateSystem";
import { useRateMetrics } from "@/hooks/useRateMetrics";
import { toast } from "sonner";
import { checkEstablishmentFeatureAccess } from "@/lib/featureAccess";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useDynamicRatePrices } from "@/contexts/DynamicRatePricesContext";
import { RateEditDialog } from "./RateEditDialog";
import { BulkEditDialog } from "./BulkEditDialog";
import { RateMetricsSummary } from "./RateMetricsSummary";
import { CreateRateDialog } from "./CreateRateDialog";
import { useLazyCalendarRange, normalizeRateCalendarDateKey } from "@/lib/rateSystem";

interface RateCalendarGridProps {
  ratePlans: RatePlan[];
  categories: any[];
  rateCalendar?: RateCalendarEntry[];
  selectedCategory: string;
  selectedRatePlan: string;
  startDate: Date;
  viewDays?: number;
  onViewDaysChange?: (days: number) => void;
  onCategoryChange: (category: string) => void;
  onPlanChange: (plan: string) => void;
  onStartDateChange: (date: Date) => void;
}

export const RateCalendarGrid = ({
  ratePlans,
  categories,
  rateCalendar: rateCalendarProp,
  selectedCategory,
  selectedRatePlan,
  startDate,
  viewDays: viewDaysProp,
  onViewDaysChange,
  onCategoryChange,
  onPlanChange,
  onStartDateChange,
}: RateCalendarGridProps) => {
  const [viewDaysLocal, setViewDaysLocal] = useState(30);
  const viewDays = viewDaysProp ?? viewDaysLocal;
  const setViewDays = (d: number) => {
    if (viewDaysProp !== undefined) {
      onViewDaysChange?.(d);
    } else {
      setViewDaysLocal(d);
    }
  };
  const [editingRate, setEditingRate] = useState<{
    planId: string;
    categoryId: string;
    date: Date;
    price?: number;
  } | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [createRateOpen, setCreateRateOpen] = useState(false);
  const [calculatedPrices, setCalculatedPrices] = useState<Map<string, number>>(new Map());
  const [categoryOccupancy, setCategoryOccupancy] = useState<Map<string, number>>(new Map()); // key: categoryId-dateStr, value: occupancy
  const [dynamicPriceKeys, setDynamicPriceKeys] = useState<Set<string>>(new Set()); // Rastrear quais preços foram alterados por regras dinâmicas
  const [calculatingPriceKeys, setCalculatingPriceKeys] = useState<Set<string>>(new Set()); // Evitar overlay: não mostrar base enquanto calcula
  const [hasFeatureAccess, setHasFeatureAccess] = useState<boolean | null>(null); // null = ainda não verificado

  const { selectedEstablishment } = useEstablishment();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [lazyState, { loadRight, loadLeft, reset: resetLazy }] = useLazyCalendarRange({
    initialStart: startDate,
    totalCalendarDays: viewDays,
    initialWindowDays: Math.min(31, viewDays),
  });

  const dateRange = useMemo(
    () => ({ start: lazyState.loadedStart, end: lazyState.loadedEnd }),
    [lazyState.loadedStart, lazyState.loadedEnd]
  );
  const {
    rateCalendar: rateCalendarFromHook,
    isLoadingCalendar,
    getRateCalendarForPeriod,
    upsertRateCalendar,
    bulkUpdateRates,
    refetch: refetchRateCalendar,
    calculateRatePrice,
    dynamicRules,
    persistDynamicRates,
    autoApplyDynamicRules,
  } = useRateSystem({ dateRange });
  const rateCalendar = rateCalendarProp !== undefined ? rateCalendarProp : rateCalendarFromHook;

  useEffect(() => {
    resetLazy();
  }, [startDate, viewDays, resetLazy]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 150;
    const nearRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - threshold;
    const nearLeft = el.scrollLeft <= threshold;
    if (nearRight && lazyState.hasMoreRight) loadRight();
    if (nearLeft && lazyState.hasMoreLeft) loadLeft();
  }, [lazyState.hasMoreRight, lazyState.hasMoreLeft, loadRight, loadLeft]);

  const { getMetricsForDate, calculateOccupancy, calculatePickupRate } = useRateMetrics();
  const dynamicPrices = useDynamicRatePrices();

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
      start: lazyState.loadedStart,
      end: lazyState.loadedEnd,
    });
  }, [lazyState.loadedStart, lazyState.loadedEnd]);

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

  const rateEntryLookup = useMemo(() => {
    const map = new Map<string, RateCalendarEntry>();
    for (const entry of filteredRateCalendar) {
      const dateKey = normalizeRateCalendarDateKey(entry.date);
      map.set(`${entry.pricing_plan_id}|${entry.category_id}|${dateKey}`, {
        ...entry,
        date: dateKey,
      } as RateCalendarEntry);
    }
    return map;
  }, [filteredRateCalendar]);

  const getRateEntry = useCallback(
    (planId: string, categoryId: string, dateStr: string) =>
      rateEntryLookup.get(`${planId}|${categoryId}|${normalizeRateCalendarDateKey(dateStr)}`),
    [rateEntryLookup],
  );

  // Preencher calculatedPrices com rate_calendar assim que carregar (evita flash preço mínimo → tarifário)
  useEffect(() => {
    if (filteredRateCalendar.length === 0) return;
    setCalculatedPrices((prev) => {
      const merged = new Map(prev);
      for (const entry of filteredRateCalendar) {
        const dateKey = normalizeRateCalendarDateKey(entry.date);
        const key = `${entry.pricing_plan_id}-${entry.category_id}-${dateKey}`;
        const price = Number(entry.base_price ?? 0);
        if (price > 0 && (!merged.has(key) || Math.abs((merged.get(key) ?? 0) - price) > 0.01)) {
          merged.set(key, price);
        }
      }
      return merged;
    });
  }, [filteredRateCalendar]);

  useEffect(() => {
    setDynamicPriceKeys(new Set());
    setCalculatingPriceKeys(new Set());
  }, [selectedRatePlan, selectedCategory]);

  // Calcular preços quando o plano ou período mudar (apenas para datas sem entrada no calendário)
  useEffect(() => {
    if (!selectedRatePlan || filteredCategories.length === 0 || visibleDates.length === 0) {
      return;
    }

    // Filtrar datas baseado nas regras dinâmicas ativas
    // Se houver regras, calcular apenas para datas dentro do período das regras
    let datesToProcess = visibleDates;
    
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
          });
          
        }
      }
    }
    
    // Limites para evitar ERR_INSUFFICIENT_RESOURCES (mais células para aplicar regras dinâmicas)
    const categoriesToProcess = filteredCategories.slice(0, 8);
    const plansToProcess = selectedRatePlan === 'all' ? activePlansToShow.slice(0, 6) : activePlansToShow;
    
    const calculateMissingPrices = async () => {
      // Respeitar configuração do usuário: regras dinâmicas só quando "Aplicar Regras Dinâmicas Automaticamente" está ativo
      const shouldApplyDynamicRules = autoApplyDynamicRules;
      const hasEnrichedData = filteredRateCalendar.some(
        (e) => e && "original_base_price" in e && (e as { original_base_price?: number }).original_base_price !== undefined
      );
      const needsClientCalculation = shouldApplyDynamicRules && (!persistDynamicRates || !hasEnrichedData) && !hasEnrichedData;

      const keysToCalculate = new Set<string>();
      // 1. Regras dinâmicas: calcular preços quando auto_apply está ativo
      if (needsClientCalculation) {
        for (const plan of plansToProcess) {
          for (const category of categoriesToProcess) {
            for (const date of datesToProcess) {
              keysToCalculate.add(`${plan.id}-${category.id}-${format(date, "yyyy-MM-dd")}`);
            }
          }
        }
      }
      // 2. Tarifa Base + Flutuação: planos com base_plan_id_for_rate sem entrada no rate_calendar
      const tasksForBasePlan: Array<{ key: string; plan: typeof plansToProcess[0]; category: typeof categoriesToProcess[0]; date: Date }> = [];
      const planHasBasePlan = (p: typeof plansToProcess[0]) =>
        !!(p as { base_plan_id_for_rate?: string }).base_plan_id_for_rate;
      for (const plan of plansToProcess) {
        if (!planHasBasePlan(plan)) continue;
        for (const category of categoriesToProcess) {
          for (const date of datesToProcess) {
            const dateStr = format(date, "yyyy-MM-dd");
            const rateEntry = getRateEntry(plan.id, category.id, dateStr);
            if (!rateEntry?.base_price || rateEntry.base_price <= 0) {
              const key = `${plan.id}-${category.id}-${dateStr}`;
              keysToCalculate.add(key);
              tasksForBasePlan.push({ key, plan, category, date });
            }
          }
        }
      }
      if (keysToCalculate.size > 0) {
        const limited = Array.from(keysToCalculate).slice(0, 300);
        keysToCalculate.clear();
        limited.forEach((k) => keysToCalculate.add(k));
        setCalculatingPriceKeys(new Set(keysToCalculate));
      }

      const newPrices = new Map<string, number>();
      if (dynamicPrices) {
          const snapshot = dynamicPrices.getPricesSnapshot();
          Object.entries(snapshot).forEach(([k, v]) => {
            if (v > 0) newPrices.set(k, v);
          });
        }
        // Depois, preencher com rate_calendar ou cache local para chaves ainda vazias
        for (const plan of plansToProcess) {
          for (const category of categoriesToProcess) {
            for (const date of datesToProcess) {
              const dateStr = format(date, "yyyy-MM-dd");
              const key = `${plan.id}-${category.id}-${dateStr}`;
              if (keysToCalculate.has(key)) continue;
              if (newPrices.has(key) && (newPrices.get(key) || 0) > 0) continue;
              const cachedPrice = calculatedPrices.get(key);
              if (cachedPrice && cachedPrice > 0) {
                newPrices.set(key, cachedPrice);
                continue;
              }
              
              const rateEntry = getRateEntry(plan.id, category.id, dateStr);
              const entryEnriched = rateEntry && "original_base_price" in rateEntry && (rateEntry as { original_base_price?: number }).original_base_price !== undefined;
              if (entryEnriched && rateEntry?.base_price && rateEntry.base_price > 0) {
                // Se regras desativadas, usar tarifa base; senão usar preço dinâmico
                const entry = rateEntry as { base_price?: number; original_base_price?: number };
                const usePrice = autoApplyDynamicRules && Math.abs((entry.base_price ?? 0) - (entry.original_base_price ?? 0)) > 0.01
                  ? entry.base_price!
                  : (entry.original_base_price ?? entry.base_price ?? 0);
                newPrices.set(key, usePrice);
              } else if (rateEntry?.base_price && rateEntry.base_price > 0) {
                newPrices.set(key, rateEntry.base_price);
              } else {
                const basePrice = Number(category.base_price) || 0;
                if (basePrice > 0) newPrices.set(key, basePrice);
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

        if (persistDynamicRates && hasEnrichedData) {
          // Usar preços persistidos SOMENTE quando auto_apply está ativo; se desativado, mostrar tarifa base
          const enrichedKeys = new Set<string>();
          for (const plan of plansToProcess) {
            for (const category of categoriesToProcess) {
              for (const date of datesToProcess) {
                const dateStr = format(date, "yyyy-MM-dd");
                const rateEntry = getRateEntry(plan.id, category.id, dateStr);
                const entry = rateEntry as { base_price?: number; original_base_price?: number } | undefined;
                if (entry?.original_base_price !== undefined) {
                  const key = `${plan.id}-${category.id}-${dateStr}`;
                  const hasDynamicAdjustment = entry.base_price && Math.abs(entry.base_price - entry.original_base_price) > 0.01;
                  // Quando regras desativadas: mostrar original; quando ativas: mostrar base_price (dinâmico)
                  const priceToUse = autoApplyDynamicRules && hasDynamicAdjustment ? entry.base_price! : entry.original_base_price;
                  newPrices.set(key, priceToUse);
                  if (autoApplyDynamicRules && hasDynamicAdjustment) enrichedKeys.add(key);
                }
              }
            }
          }
          if (enrichedKeys.size > 0) {
            setDynamicPriceKeys((prev) => new Set([...prev, ...enrichedKeys]));
          }
        } else if (shouldApplyDynamicRules && (!persistDynamicRates || !hasEnrichedData)) {
          if (hasEnrichedData && autoApplyDynamicRules) {
            const enrichedKeys = new Set<string>();
            for (const plan of plansToProcess) {
              for (const category of categoriesToProcess) {
                for (const date of datesToProcess) {
                  const dateStr = format(date, "yyyy-MM-dd");
                  const rateEntry = filteredRateCalendar.find(
                    (r) => r.pricing_plan_id === plan.id && r.category_id === category.id && r.date === dateStr
                  );
                  const entry = rateEntry as { base_price?: number; original_base_price?: number } | undefined;
                  if (entry?.original_base_price !== undefined && entry?.base_price && Math.abs(entry.base_price - entry.original_base_price) > 0.01) {
                    const key = `${plan.id}-${category.id}-${dateStr}`;
                    newPrices.set(key, entry.base_price);
                    enrichedKeys.add(key);
                  }
                }
              }
            }
            if (enrichedKeys.size > 0) {
              setDynamicPriceKeys((prev) => new Set([...prev, ...enrichedKeys]));
            }
          } else if (!hasEnrichedData) {
            const BATCH_SIZE = 12;
            const BATCH_DELAY_MS = 50;
            const MAX_TASKS = 300;
            const tasks: Array<{ key: string; plan: typeof plansToProcess[0]; category: typeof categoriesToProcess[0]; date: Date }> = [];
            for (const plan of plansToProcess) {
              for (const category of categoriesToProcess) {
                for (const date of datesToProcess) {
                  const dateStr = format(date, "yyyy-MM-dd");
                  tasks.push({ key: `${plan.id}-${category.id}-${dateStr}`, plan, category, date });
                }
              }
            }
            const tasksToRun = tasks.slice(0, MAX_TASKS);
            for (let i = 0; i < tasksToRun.length; i += BATCH_SIZE) {
              const batch = tasksToRun.slice(i, i + BATCH_SIZE);
              const results = await Promise.all(
                batch.map(async ({ key, plan, category, date }) => {
                  try {
                    const calculatedPrice = await calculateRatePrice(category.id, plan.id, date, 2, 0);
                    const dateStr = format(date, "yyyy-MM-dd");
                    const rateEntry = getRateEntry(plan.id, category.id, dateStr);
                    const originalPrice = rateEntry?.base_price || Number(category.base_price) || 0;
                    const isDynamicPrice = calculatedPrice > 0 && Math.abs(calculatedPrice - originalPrice) > 0.01;
                    if (calculatedPrice > 0) {
                      return { key, price: calculatedPrice, isDynamicPrice };
                    }
                  } catch (error) {
                    console.warn(`Erro ao calcular preço para ${category.name} - ${plan.name}:`, error);
                  }
                  return null;
                })
              );
              results.forEach((r) => {
                if (r) {
                  newPrices.set(r.key, r.price);
                  if (r.isDynamicPrice) {
                    setDynamicPriceKeys((prev) => new Set(prev).add(r!.key));
                  }
                }
              });
              // Atualizar UI progressivamente após cada batch (evita esperar todos os cálculos)
              setCalculatedPrices((prev) => {
                const merged = new Map(prev);
                newPrices.forEach((value, key) => {
                  const existing = merged.get(key);
                  if (existing === undefined || Math.abs(existing - value) > 0.01) {
                    merged.set(key, value);
                  }
                });
                return merged;
              });
              if (dynamicPrices) {
                const toSet: Record<string, number> = {};
                newPrices.forEach((v, k) => { if (v > 0) toSet[k] = v; });
                dynamicPrices.setPrices(toSet);
              }
              if (i + BATCH_SIZE < tasksToRun.length) {
                await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
              }
            }
          }
          setCalculatingPriceKeys(new Set());
          if (dynamicPrices) {
            const toSet: Record<string, number> = {};
            newPrices.forEach((v, k) => {
              if (v > 0) toSet[k] = v;
            });
            dynamicPrices.setPrices(toSet);
          }
        } else if (tasksForBasePlan.length > 0) {
          // Tarifa Base + Flutuação: chamar calculate_rate_price para planos derivados sem rate_calendar
          const BATCH_SIZE_BP = 12;
          const BATCH_DELAY_MS_BP = 50;
          const tasksToRun = tasksForBasePlan.slice(0, 300);
          for (let i = 0; i < tasksToRun.length; i += BATCH_SIZE_BP) {
            const batch = tasksToRun.slice(i, i + BATCH_SIZE_BP);
            const results = await Promise.all(
              batch.map(async ({ key, plan, category, date }) => {
                try {
                  const calculatedPrice = await calculateRatePrice(category.id, plan.id, date, 2, 0);
                  if (calculatedPrice > 0) {
                    return { key, price: calculatedPrice };
                  }
                } catch (error) {
                  console.warn(`Erro ao calcular Tarifa Base para ${category.name} - ${plan.name}:`, error);
                }
                return null;
              })
            );
            results.forEach((r) => {
              if (r) newPrices.set(r.key, r.price);
            });
            // Atualizar UI progressivamente
            setCalculatedPrices((prev) => {
              const merged = new Map(prev);
              newPrices.forEach((value, key) => {
                const existing = merged.get(key);
                if (existing === undefined || Math.abs(existing - value) > 0.01) {
                  merged.set(key, value);
                }
              });
              return merged;
            });
            if (dynamicPrices) {
              const toSet: Record<string, number> = {};
              newPrices.forEach((v, k) => { if (v > 0) toSet[k] = v; });
              dynamicPrices.setPrices(toSet);
            }
            if (i + BATCH_SIZE_BP < tasksToRun.length) {
              await new Promise((r) => setTimeout(r, BATCH_DELAY_MS_BP));
            }
          }
          setCalculatingPriceKeys(new Set());
        } else {
          setCalculatingPriceKeys(new Set());
        }
      
      // Modo Preview Dinâmico: NÃO persistir no banco a cada acesso.
      // Preços calculados por regras dinâmicas ficam apenas em cache (calculatedPrices, DynamicRatePricesContext).
      // Persistir apenas quando o usuário editar manualmente (RateEditDialog, BulkEditDialog, etc.).
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
    const timeoutId = setTimeout(calculateMissingPrices, 0);
    return () => clearTimeout(timeoutId);
  }, [selectedRatePlan, filteredCategories, visibleDates, calculateRatePrice, activePlansToShow, dynamicRules, hasFeatureAccess, autoApplyDynamicRules, filteredRateCalendar, dynamicPrices, persistDynamicRates, getRateEntry]);

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
      const dateStr = format(data.date, "yyyy-MM-dd");
      await upsertRateCalendar([{
        pricing_plan_id: data.planId,
        category_id: data.categoryId,
        date: dateStr,
        base_price: data.basePrice,
        adult_price: data.adultPrice,
        child_price: data.childPrice,
      }]);
      const cacheKey = `${data.planId}-${data.categoryId}-${dateStr}`;
      setCalculatedPrices((prev) => {
        const next = new Map(prev);
        next.set(cacheKey, data.basePrice);
        return next;
      });
      setDynamicPriceKeys((prev) => {
        const next = new Set(prev);
        next.delete(cacheKey);
        return next;
      });
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
      {(() => {
        const cellMinPx = viewDays <= 14 ? 90 : viewDays <= 30 ? 70 : viewDays <= 60 ? 50 : 40;
        const gridMinWidth = visibleDates.length * cellMinPx;
        return (
      <Card
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="p-0 overflow-x-auto overflow-y-visible max-w-full"
      >
        <div className="pr-12 pb-2" style={{ minWidth: Math.max(gridMinWidth + 208, 0), width: 'max-content' }}>
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
              <div className="flex-1 flex flex-shrink-0" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, minmax(${cellMinPx}px, 1fr))`, minWidth: gridMinWidth }}>
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
                <div className="flex-1 flex flex-shrink-0" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, minmax(${cellMinPx}px, 1fr))`, minWidth: gridMinWidth }}>
                  {visibleDates.map((date) => {
                    const dateStr = format(date, "yyyy-MM-dd");
                      // Buscar entrada específica para o plano e categoria
                    const rateEntry = getRateEntry(plan.id, category.id, dateStr);
                    
                      // Determinar preço: exibir imediatamente (rate_calendar ou base da categoria) e atualizar ao concluir cálculo
                      const cacheKey = `${plan.id}-${category.id}-${dateStr}`;
                      const entryEnriched = rateEntry && 'original_base_price' in rateEntry && rateEntry.original_base_price !== undefined;
                      const calendarPrice =
                        rateEntry?.base_price != null && Number(rateEntry.base_price) > 0
                          ? Number(rateEntry.base_price)
                          : undefined;
                      const cachedPrice = calculatedPrices.get(cacheKey);
                      let price = calendarPrice ?? cachedPrice;

                      if (!price || price === 0) {
                        price = Number(category.base_price) || 0;
                      }

                      // Quando regras dinâmicas desativadas e temos dados enriquecidos: mostrar tarifa base
                      const originalPrice = entryEnriched
                        ? Number((rateEntry as { original_base_price?: number }).original_base_price)
                        : (rateEntry?.base_price ?? (Number(category.base_price) || 0));
                      if (!autoApplyDynamicRules && entryEnriched && originalPrice > 0) {
                        price = originalPrice; // Forçar preço base quando regras desativadas
                      }
                      const isDynamicPrice = autoApplyDynamicRules && (entryEnriched || dynamicPriceKeys.has(cacheKey));
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
                          "rounded-lg w-full min-w-0 transition-all duration-500 ease-in-out flex flex-col items-center justify-center overflow-visible",
                          innerPadding,
                          getOccupancyColor(occupancy || projectedOccupancy),
                          "bg-opacity-10 group-hover:bg-opacity-20",
                          isActuallyDynamic && "ring-2 ring-purple-400 ring-opacity-60 bg-purple-50 dark:bg-purple-950/20 shadow-md"
                        )}>
                          <div className={cn(
                            "font-semibold transition-all duration-500 ease-in-out leading-tight break-words whitespace-nowrap",
                            fontSize,
                            isActuallyDynamic ? "text-purple-700 dark:text-purple-300" : "text-gray-900"
                          )}>
                            {isActuallyDynamic ? (
                              <RatePriceBreakdown
                                basePrice={originalPrice}
                                finalPrice={price}
                                size={viewDays <= 14 ? "md" : "sm"}
                                showBadge={viewDays <= 30}
                                compact={viewDays > 14}
                              />
                            ) : (
                              formatCurrencyWithoutZeroCents(price)
                            )}
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
        );
      })()}

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

            // Tarifa Base + Flutuação: aplicar somente ao criar tarifário em massa
            const applyPlanFluctuation = (basePrice: number, plan: RatePlan): number => {
              if (!plan.base_plan_id_for_rate || !plan.fluctuation_type || plan.fluctuation_value == null) return basePrice;
              if (plan.fluctuation_type === 'percentage') {
                return basePrice * (1 + Number(plan.fluctuation_value) / 100);
              }
              return basePrice + Number(plan.fluctuation_value);
            };

            // Para cada combinação categoria/plano, calcular os novos preços
            for (const item of data.categoryPlans) {
              const category = filteredCategories.find(c => c.id === item.categoryId);
              const plan = ratePlans.find(p => p.id === item.planId);
              const basePlanId = plan?.base_plan_id_for_rate;
              
              for (const dateStr of dates) {
                let currentPrice: number;
                
                // Tarifa Base + Flutuação: usar preço do plano base quando o plano derivado tem base_plan_id_for_rate
                if (basePlanId && plan?.fluctuation_type && plan.fluctuation_value != null) {
                  const basePlanEntry = getRateEntry(basePlanId, item.categoryId, dateStr);
                  const basePrice = Number(basePlanEntry?.base_price ?? category?.base_price ?? 0) || 0;
                  currentPrice = applyPlanFluctuation(Number(basePrice), plan!);
                } else {
                  const existingEntry = getRateEntry(item.planId, item.categoryId, dateStr);
                  currentPrice = Number(existingEntry?.base_price ?? category?.base_price ?? 0) || 0;
                }
                
                let newBasePrice: number;
                if (item.adjustmentType === 'percentage') {
                  newBasePrice = currentPrice * (1 + item.adjustmentValue / 100);
                } else if (item.adjustmentType === 'fixed') {
                  newBasePrice = currentPrice + item.adjustmentValue;
                } else {
                  newBasePrice = item.adjustmentValue;
                }
                
                if (newBasePrice < 0) newBasePrice = 0;
                newBasePrice = Math.round(newBasePrice * 100) / 100;

                const existingEntry = getRateEntry(item.planId, item.categoryId, dateStr);

                entries.push({
                  pricing_plan_id: item.planId,
                  category_id: item.categoryId,
                  date: dateStr,
                  base_price: newBasePrice,
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

