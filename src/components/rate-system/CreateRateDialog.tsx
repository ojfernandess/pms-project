import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format, startOfDay, addDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { RatePlan } from "@/hooks/useRateSystem";
import { toast } from "sonner";
import {
  RateDaySelectionFields,
  RateSpecificDatesPriceSection,
  WeeklyPriceFields,
} from "@/components/rate-system/RateDaySelectionFields";
import {
  eachDateStringInRange,
  filterDatesBySelection,
  parseOptionalMoney,
  pruneSpecificDatePricesInRange,
  pruneSpecificDatesInRange,
  resolveCreateBasePlanPriceForDerived,
  resolveCreateBasePriceForDate,
  validateCreatePlanPricing,
  validateRateDateSelection,
  type RateDateSelectionMode,
} from "@/lib/rateEditorDaySelection";

/** Aplica flutuação ao preço base (mesma lógica da Grade ARI e Edição em lote). */
function applyPlanFluctuation(basePrice: number, plan: RatePlan): number {
  if (!plan.base_plan_id_for_rate || !plan.fluctuation_type || plan.fluctuation_value == null) return basePrice;
  if (plan.fluctuation_type === "percentage") {
    return basePrice * (1 + Number(plan.fluctuation_value) / 100);
  }
  return basePrice + Number(plan.fluctuation_value);
}

interface CreateRateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: any[];
  ratePlans: RatePlan[];
  onSave: (data: {
    categoryId: string;
    planId: string;
    entries: Array<{
      date: string;
      basePrice: number;
      adultPrice?: number;
      childPrice?: number;
    }>;
  }) => Promise<void>;
}

export const CreateRateDialog = ({
  open,
  onOpenChange,
  categories,
  ratePlans,
  onSave,
}: CreateRateDialogProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Categorias e Planos, 2: Período, 3: Preço
  const [categoryPlans, setCategoryPlans] = useState<Record<string, string[]>>({}); // categoriaId -> planIds[]
  const [startDate, setStartDate] = useState<Date>(startOfDay(new Date()));
  const [endDate, setEndDate] = useState<Date>(startOfDay(addDays(new Date(), 1)));
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [prices, setPrices] = useState<Record<string, { basePrice: string; adultPrice: string; childPrice: string }>>({});
  const [dateMode, setDateMode] = useState<RateDateSelectionMode>("all");
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3, 4, 5, 6]),
  );
  const [specificDates, setSpecificDates] = useState<Set<string>>(() => new Set());
  const [specificDatePrices, setSpecificDatePrices] = useState<Record<string, string>>({});
  const [useWeeklyPrices, setUseWeeklyPrices] = useState(false);
  const [weeklyByDow, setWeeklyByDow] = useState<Record<number, string>>({});
  const [exceptions, setExceptions] = useState<Record<string, number>>({});
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionValue, setExceptionValue] = useState("");

  // Resetar estado quando o dialog abrir
  useEffect(() => {
    if (open) {
      setStep(1);
      setCategoryPlans({});
      setStartDate(startOfDay(new Date()));
      setEndDate(startOfDay(addDays(new Date(), 1)));
      setPrices({});
      setDateMode("all");
      setSelectedWeekdays(new Set([0, 1, 2, 3, 4, 5, 6]));
      setSpecificDates(new Set());
      setSpecificDatePrices({});
      setUseWeeklyPrices(false);
      setWeeklyByDow({});
      setExceptions({});
      setExceptionDate("");
      setExceptionValue("");
    }
  }, [open]);

  useEffect(() => {
    setSpecificDates((prev) => pruneSpecificDatesInRange(prev, startDate, endDate));
    setSpecificDatePrices((prev) => pruneSpecificDatePricesInRange(prev, startDate, endDate));
    setExceptions((prev) => {
      const allowed = new Set(eachDateStringInRange(startDate, endDate));
      const next: Record<string, number> = {};
      for (const [d, v] of Object.entries(prev)) {
        if (allowed.has(d)) next[d] = v;
      }
      return next;
    });
  }, [startDate, endDate]);

  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    if (checked) {
      setCategoryPlans((prev) => ({
        ...prev,
        [categoryId]: [],
      }));
    } else {
      setCategoryPlans((prev) => {
        const newState = { ...prev };
        delete newState[categoryId];
        return newState;
      });
    }
  };

  const handlePlanToggleForCategory = (categoryId: string, planId: string, checked: boolean) => {
    setCategoryPlans((prev) => {
      const currentPlans = prev[categoryId] || [];
      if (checked) {
        return {
          ...prev,
          [categoryId]: [...currentPlans, planId],
        };
      } else {
        return {
          ...prev,
          [categoryId]: currentPlans.filter((id) => id !== planId),
        };
      }
    });
  };

  const handleSelectAllPlansForCategory = (categoryId: string) => {
    const activePlans = ratePlans.filter((p) => p.is_active).map((p) => p.id);
    const currentPlans = categoryPlans[categoryId] || [];
    const allSelected = activePlans.length > 0 && activePlans.every((id) => currentPlans.includes(id));

    setCategoryPlans((prev) => ({
      ...prev,
      [categoryId]: allSelected ? [] : activePlans,
    }));
  };

  const handleSelectAllCategories = () => {
    const allCategoryIds = categories.map((c) => c.id);
    const allSelected = allCategoryIds.every((id) => categoryPlans[id] !== undefined);

    if (allSelected) {
      setCategoryPlans({});
    } else {
      const newState: Record<string, string[]> = {};
      allCategoryIds.forEach((id) => {
        newState[id] = [];
      });
      setCategoryPlans(newState);
    }
  };

  const handleNextToPeriod = () => {
    const selectedCategories = Object.keys(categoryPlans);
    if (selectedCategories.length === 0) {
      toast.error("Selecione pelo menos uma categoria");
      return;
    }

    // Verificar se todas as categorias selecionadas têm pelo menos um plano
    const categoriesWithoutPlans = selectedCategories.filter(
      (catId) => !categoryPlans[catId] || categoryPlans[catId].length === 0
    );

    if (categoriesWithoutPlans.length > 0) {
      toast.error("Todas as categorias selecionadas devem ter pelo menos um plano tarifário");
      return;
    }

    setStep(2);
  };

  const handleNextToPrice = () => {
    const err = validateRateDateSelection(
      {
        startDate,
        endDate,
        mode: dateMode,
        selectedWeekdays,
        specificDates,
      },
      { allowEmptySpecific: dateMode === "specific" },
    );
    if (err) {
      toast.error(err);
      return;
    }
    setStep(3);
  };

  const applicableDates = useMemo(() => {
    const all = eachDateStringInRange(startDate, endDate);
    return filterDatesBySelection(all, dateMode, selectedWeekdays, specificDates);
  }, [startDate, endDate, dateMode, selectedWeekdays, specificDates]);

  const toggleWeekday = (dow: number, checked: boolean) => {
    setSelectedWeekdays((prev) => {
      const next = new Set(prev);
      if (checked) next.add(dow);
      else next.delete(dow);
      return next;
    });
  };

  const toggleSpecificDate = (dateStr: string) => {
    setSpecificDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
        setSpecificDatePrices((p) => {
          const copy = { ...p };
          delete copy[dateStr];
          return copy;
        });
      } else next.add(dateStr);
      return next;
    });
  };

  const addException = () => {
    const range = eachDateStringInRange(startDate, endDate);
    if (!exceptionDate || !range.includes(exceptionDate)) {
      toast.error("A data da exceção deve estar dentro do período.");
      return;
    }
    const v = parseOptionalMoney(exceptionValue);
    if (v == null) {
      toast.error("Informe um valor válido para a exceção.");
      return;
    }
    setExceptions((prev) => ({ ...prev, [exceptionDate]: v }));
    setExceptionDate("");
    setExceptionValue("");
  };

  const removeException = (d: string) => {
    setExceptions((prev) => {
      const next = { ...prev };
      delete next[d];
      return next;
    });
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  };

  const getPriceKey = (categoryId: string, planId: string) => {
    return `${categoryId}-${planId}`;
  };

  /** Retorna preço base calculado para plano derivado (Tarifa Base + Flutuação). */
  const getDerivedPlanBasePrice = (categoryId: string, plan: RatePlan): number | null => {
    if (!plan.base_plan_id_for_rate || !plan.fluctuation_type || plan.fluctuation_value == null) return null;
    const basePlan = ratePlans.find((p) => p.id === plan.base_plan_id_for_rate);
    if (!basePlan) return null;
    const planIds = categoryPlans[categoryId] || [];
    if (!planIds.includes(basePlan.id)) return null;
    const key = getPriceKey(categoryId, basePlan.id);
    const priceData = prices[key];
    const basePriceStr = (priceData?.basePrice || "").replace(",", ".");
    const basePrice = parseFloat(basePriceStr);
    if (isNaN(basePrice) || basePrice <= 0) return null;
    return Math.round(applyPlanFluctuation(basePrice, plan) * 100) / 100;
  };

  const handlePriceChange = (categoryId: string, planId: string, field: 'basePrice' | 'adultPrice' | 'childPrice', value: string) => {
    const key = getPriceKey(categoryId, planId);
    setPrices((prev) => {
      const currentPrice = prev[key] || { basePrice: '', adultPrice: '', childPrice: '' };
      return {
        ...prev,
        [key]: {
          ...currentPrice,
          [field]: value,
        },
      };
    });
  };

  const handleSave = async () => {
    const selectedCategories = Object.keys(categoryPlans).filter(
      (catId) => categoryPlans[catId] && categoryPlans[catId].length > 0
    );

    if (selectedCategories.length === 0) {
      toast.error("Selecione pelo menos uma categoria com planos tarifários");
      return;
    }

    const selectionErr = validateRateDateSelection({
      startDate,
      endDate,
      mode: dateMode,
      selectedWeekdays,
      specificDates,
    });
    if (selectionErr) {
      toast.error(selectionErr);
      return;
    }

    if (useWeeklyPrices) {
      const hasAnyWeekly = Object.values(weeklyByDow).some((v) => parseOptionalMoney(v) != null);
      if (!hasAnyWeekly) {
        toast.error("Informe ao menos um preço por dia da semana ou desative a opção.");
        return;
      }
    }

    const weeklyNumeric: Partial<Record<number, number>> = {};
    if (useWeeklyPrices) {
      for (let dow = 0; dow < 7; dow++) {
        const p = parseOptionalMoney(weeklyByDow[dow]);
        if (p != null) weeklyNumeric[dow] = p;
      }
    }

    try {
      let savedCount = 0;
      let entryCount = 0;
      const errors: string[] = [];
      const priceByDateAndPlan = new Map<string, number>();

      for (const categoryId of selectedCategories) {
        const planIds = [...(categoryPlans[categoryId] || [])].sort((a, b) => {
          const planA = ratePlans.find((p) => p.id === a);
          const planB = ratePlans.find((p) => p.id === b);
          const hasBaseA = planA?.base_plan_id_for_rate ? 1 : 0;
          const hasBaseB = planB?.base_plan_id_for_rate ? 1 : 0;
          return hasBaseA - hasBaseB;
        });

        for (const planId of planIds) {
          const plan = ratePlans.find((p) => p.id === planId);
          const key = getPriceKey(categoryId, planId);
          const priceData = prices[key];
          const generalPrice = parseOptionalMoney(priceData?.basePrice);
          const isDerived =
            !!plan?.base_plan_id_for_rate && plan.fluctuation_type != null && plan.fluctuation_value != null;
          const planPriceErr = validateCreatePlanPricing({
            mode: dateMode,
            applicableDates,
            useWeeklyPrices,
            generalPrice,
            specificDatePrices,
            isDerivedPlan: isDerived,
          });
          if (planPriceErr) {
            const categoryName = categories.find((c) => c.id === categoryId)?.name || categoryId;
            const planName = plan?.name || planId;
            errors.push(`${categoryName} · ${planName}: ${planPriceErr}`);
            continue;
          }
          const adultPriceValue = priceData?.adultPrice
            ? parseFloat(priceData.adultPrice.replace(",", "."))
            : undefined;
          const childPriceValue = priceData?.childPrice
            ? parseFloat(priceData.childPrice.replace(",", "."))
            : undefined;

          const entries: Array<{
            date: string;
            basePrice: number;
            adultPrice?: number;
            childPrice?: number;
          }> = [];

          for (const dateStr of applicableDates) {
            let basePrice: number | null = null;

            if (plan?.base_plan_id_for_rate && plan.fluctuation_type && plan.fluctuation_value != null) {
              const basePlanId = plan.base_plan_id_for_rate;
              const baseGeneralPrice = parseOptionalMoney(
                prices[getPriceKey(categoryId, basePlanId)]?.basePrice,
              );
              const basePlanPrice = resolveCreateBasePlanPriceForDerived(
                categoryId,
                basePlanId,
                dateStr,
                priceByDateAndPlan,
                {
                  mode: dateMode,
                  baseGeneralPrice,
                  useWeeklyPrices,
                  weeklyByDow: weeklyNumeric,
                  specificDatePrices,
                  exceptions,
                },
              );
              if (basePlanPrice == null || basePlanPrice <= 0) {
                const categoryName = categories.find((c) => c.id === categoryId)?.name || categoryId;
                const basePlanName =
                  ratePlans.find((p) => p.id === basePlanId)?.name || basePlanId;
                errors.push(`${categoryName} · ${plan.name}: preço do plano base (${basePlanName}) em ${dateStr}`);
                continue;
              }
              basePrice = Math.round(applyPlanFluctuation(basePlanPrice, plan) * 100) / 100;
            } else {
              basePrice = resolveCreateBasePriceForDate(dateStr, {
                mode: dateMode,
                generalPrice,
                useWeeklyPrices,
                weeklyByDow: weeklyNumeric,
                specificDatePrices,
                exceptions,
              });
            }

            if (basePrice == null || basePrice <= 0) {
              const categoryName = categories.find((c) => c.id === categoryId)?.name || categoryId;
              const planName = plan?.name || planId;
              errors.push(`${categoryName} · ${planName} (${dateStr})`);
              continue;
            }

            priceByDateAndPlan.set(`${categoryId}|${planId}|${dateStr}`, basePrice);
            entries.push({
              date: dateStr,
              basePrice,
              adultPrice: adultPriceValue && !isNaN(adultPriceValue) ? adultPriceValue : undefined,
              childPrice: childPriceValue && !isNaN(childPriceValue) ? childPriceValue : undefined,
            });
          }

          if (entries.length === 0) continue;

          try {
            await onSave({ categoryId, planId, entries });
            savedCount++;
            entryCount += entries.length;
          } catch (error: any) {
            const categoryName = categories.find((c) => c.id === categoryId)?.name || categoryId;
            const planName = ratePlans.find((p) => p.id === planId)?.name || planId;
            errors.push(`${categoryName} - ${planName}`);
            console.error(`Erro ao salvar tarifa para categoria ${categoryId} e plano ${planId}:`, error);
          }
        }
      }

      if (savedCount > 0) {
        if (errors.length > 0) {
          toast.warning(
            `${entryCount} diária(s) salva(s) em ${savedCount} plano(s). Alguns itens falharam: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}`,
          );
        } else {
          toast.success(`${entryCount} diária(s) criada(s) com sucesso!`);
        }
        onOpenChange(false);
      } else {
        toast.error(
          errors.length > 0
            ? `Nenhuma tarifa criada. Verifique: ${errors.slice(0, 5).join("; ")}`
            : "Nenhum tarifário foi criado.",
        );
      }
    } catch (error: any) {
      console.error("Erro ao salvar tarifas:", error);
      toast.error(error.message || "Erro ao criar tarifários");
    }
  };

  const activePlans = ratePlans.filter((p) => p.is_active);
  const selectedCategories = Object.keys(categoryPlans);
  const totalCombinations = selectedCategories.reduce(
    (sum, catId) => sum + (categoryPlans[catId]?.length || 0),
    0
  );
  const daysCount = applicableDates.length;
  const periodDaysCount = differenceInDays(endDate, startDate) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.25rem)] sm:w-full max-w-3xl max-h-[min(92vh,56rem)] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Criar Tarifários</DialogTitle>
          <DialogDescription>
            {step === 1 && "Selecione as categorias e os planos tarifários para cada uma"}
            {step === 2 && "Defina o período (data inicial e final)"}
            {step === 3 &&
              (dateMode === "specific"
                ? "Selecione as datas, defina os valores e os preços por categoria/plano"
                : "Defina o preço que será aplicado")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Selecionar Categorias e Planos */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Categorias e Planos Tarifários *</Label>
                <Button
                  variant="link"
                  size="sm"
                  onClick={handleSelectAllCategories}
                  className="h-auto p-0 text-xs"
                >
                  {selectedCategories.length === categories.length ? "Desmarcar Todas" : "Selecionar Todas"}
                </Button>
              </div>
              <div className="space-y-3 border rounded-md p-4 max-h-96 overflow-y-auto">
                {categories.length > 0 ? (
                  categories.map((category) => {
                    const isCategorySelected = categoryPlans[category.id] !== undefined;
                    const categoryPlansList = categoryPlans[category.id] || [];

                    return (
                      <div key={category.id} className="border-b last:border-b-0 pb-3 last:pb-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <Checkbox
                            id={`category-${category.id}`}
                            checked={isCategorySelected}
                            onCheckedChange={(checked) => {
                              handleCategoryToggle(category.id, checked === true);
                            }}
                          />
                          <label
                            htmlFor={`category-${category.id}`}
                            className="text-sm font-semibold leading-none cursor-pointer flex-1"
                          >
                            {category.name}
                          </label>
                        </div>

                        {isCategorySelected && (
                          <div className="ml-6 mt-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">Planos para esta categoria:</Label>
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => handleSelectAllPlansForCategory(category.id)}
                                className="h-auto p-0 text-xs"
                              >
                                {categoryPlansList.length === activePlans.length
                                  ? "Desmarcar Todos"
                                  : "Selecionar Todos"}
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {activePlans.map((plan) => {
                                const isPlanSelected = categoryPlansList.includes(plan.id);
                                return (
                                  <div key={plan.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`plan-${category.id}-${plan.id}`}
                                      checked={isPlanSelected}
                                      onCheckedChange={(checked) => {
                                        handlePlanToggleForCategory(category.id, plan.id, checked === true);
                                      }}
                                    />
                                    <label
                                      htmlFor={`plan-${category.id}-${plan.id}`}
                                      className="text-xs font-medium leading-none cursor-pointer flex-1"
                                    >
                                      {plan.name} {plan.code && `(${plan.code})`}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                            {categoryPlansList.length === 0 && (
                              <p className="text-xs text-amber-600 mt-1">
                                Selecione pelo menos um plano para esta categoria
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma categoria disponível
                  </p>
                )}
              </div>
              {totalCombinations > 0 && (
                <p className="text-sm text-muted-foreground">
                  Total: {totalCombinations} combinação(ões) de categoria/plano selecionada(s)
                </p>
              )}
            </div>
          )}

          {/* Step 2: Selecionar Período */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Data Inicial *</Label>
                <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal mt-1"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(startDate, "dd/MM/yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(selectedDate) => {
                        if (selectedDate) {
                          setStartDate(startOfDay(selectedDate));
                          setStartDateOpen(false);
                          if (selectedDate > endDate) {
                            setEndDate(startOfDay(addDays(selectedDate, 1)));
                          }
                        }
                      }}
                      initialFocus
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>Data Final *</Label>
                <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal mt-1"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(selectedDate) => {
                        if (selectedDate) {
                          if (selectedDate < startDate) {
                            toast.error("A data final deve ser posterior à data inicial");
                            return;
                          }
                          setEndDate(startOfDay(selectedDate));
                          setEndDateOpen(false);
                        }
                      }}
                      initialFocus
                      locale={ptBR}
                      disabled={(date) => date < startDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">
                  Período: {format(startDate, "dd/MM/yyyy", { locale: ptBR })} até{" "}
                  {format(endDate, "dd/MM/yyyy", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Período: {periodDaysCount} dia(s) no calendário
                  {dateMode !== "specific" &&
                    ` · ${daysCount} dia(s) selecionado(s) · até ${totalCombinations * daysCount} tarifário(s)`}
                  {dateMode === "specific" && " · datas e valores na próxima etapa"}
                </p>
              </div>

              <RateDaySelectionFields
                startDate={startDate}
                endDate={endDate}
                dateMode={dateMode}
                onDateModeChange={setDateMode}
                selectedWeekdays={selectedWeekdays}
                onToggleWeekday={toggleWeekday}
                specificDates={specificDates}
                onToggleSpecificDate={toggleSpecificDate}
                onSelectAllSpecific={() =>
                  setSpecificDates(new Set(eachDateStringInRange(startDate, endDate)))
                }
                onClearSpecific={() => {
                  setSpecificDates(new Set());
                  setSpecificDatePrices({});
                }}
                specificUiPlacement="deferred"
              />
            </div>
          )}

          {/* Step 3: Definir Preço */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-2">Resumo:</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    <strong>Categorias:</strong> {selectedCategories.length}
                  </p>
                  <p>
                    <strong>Combinações:</strong> {totalCombinations}
                  </p>
                  <p>
                    <strong>Período:</strong> {format(startDate, "dd/MM/yyyy", { locale: ptBR })} até{" "}
                    {format(endDate, "dd/MM/yyyy", { locale: ptBR })} · {daysCount} dia(s) aplicável(eis)
                  </p>
                  <p>
                    <strong>Total de tarifários:</strong> {totalCombinations * daysCount}
                  </p>
                </div>
              </div>

              {dateMode === "specific" && (
                <RateSpecificDatesPriceSection
                  startDate={startDate}
                  endDate={endDate}
                  specificDates={specificDates}
                  onToggleSpecificDate={toggleSpecificDate}
                  onSelectAllSpecific={() =>
                    setSpecificDates(new Set(eachDateStringInRange(startDate, endDate)))
                  }
                  onClearSpecific={() => {
                    setSpecificDates(new Set());
                    setSpecificDatePrices({});
                  }}
                  specificDatePrices={specificDatePrices}
                  onSpecificDatePriceChange={(d, v) =>
                    setSpecificDatePrices((prev) => ({ ...prev, [d]: v }))
                  }
                />
              )}

              {dateMode !== "specific" && (
                <WeeklyPriceFields
                  enabled={useWeeklyPrices}
                  onEnabledChange={setUseWeeklyPrices}
                  weeklyValues={weeklyByDow}
                  onWeeklyChange={(dow, value) =>
                    setWeeklyByDow((prev) => ({ ...prev, [dow]: value }))
                  }
                />
              )}

              {dateMode !== "specific" && (
              <div className="space-y-2 border rounded-md p-3">
                <Label className="text-sm font-medium">Exceções — datas com valores diferentes</Label>
                <p className="text-xs text-muted-foreground">
                  Substituem o valor geral ou do dia da semana apenas na data indicada.
                </p>
                <div className="flex flex-wrap gap-2 items-end">
                  <input
                    type="date"
                    className="border rounded-md px-2 py-2 text-sm h-9 bg-background"
                    value={exceptionDate}
                    min={format(startDate, "yyyy-MM-dd")}
                    max={format(endDate, "yyyy-MM-dd")}
                    onChange={(e) => setExceptionDate(e.target.value)}
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="Valor R$"
                    className="h-9 w-32"
                    value={exceptionValue}
                    onChange={(e) => setExceptionValue(e.target.value)}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addException}>
                    Adicionar
                  </Button>
                </div>
                {Object.keys(exceptions).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(exceptions)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([d, v]) => (
                        <span
                          key={d}
                          className="text-xs border rounded-full px-2 py-1 flex items-center gap-1"
                        >
                          {d.split("-").reverse().join("/")} · R$ {v.toFixed(2)}
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeException(d)}
                            aria-label="Remover"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                  </div>
                )}
              </div>
              )}

              <div>
                <Label className="mb-3 block">Preços por Categoria e Plano Tarifário *</Label>
                <div className="space-y-4 border rounded-md p-4 max-h-96 overflow-y-auto">
                  {selectedCategories.map((categoryId) => {
                    const category = categories.find((c) => c.id === categoryId);
                    const planIds = categoryPlans[categoryId] || [];
                    
                    return (
                      <div key={categoryId} className="border-b last:border-b-0 pb-4 last:pb-0">
                        <div className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: category?.color || '#3B82F6' }}></div>
                          {category?.name}
                        </div>
                        <div className="space-y-3 ml-5">
                          {(() => {
                            // Ordenar: planos base primeiro, depois derivados (Tarifa Base + Flutuação)
                            const sortedPlanIds = [...planIds].sort((a, b) => {
                              const planA = ratePlans.find((p) => p.id === a);
                              const planB = ratePlans.find((p) => p.id === b);
                              const hasBaseA = planA?.base_plan_id_for_rate ? 1 : 0;
                              const hasBaseB = planB?.base_plan_id_for_rate ? 1 : 0;
                              return hasBaseA - hasBaseB;
                            });
                            return sortedPlanIds.map((planId) => {
                              const plan = ratePlans.find((p) => p.id === planId);
                              const key = getPriceKey(categoryId, planId);
                              const priceData = prices[key] || { basePrice: "", adultPrice: "", childPrice: "" };
                              const derivedBasePrice = plan ? getDerivedPlanBasePrice(categoryId, plan) : null;
                              const isDerivedWithBase = derivedBasePrice !== null;
                              const basePlan = plan?.base_plan_id_for_rate
                                ? ratePlans.find((p) => p.id === plan.base_plan_id_for_rate)
                                : null;
                              const fluctuationLabel =
                                plan?.fluctuation_type && plan.fluctuation_value != null
                                  ? plan.fluctuation_type === "percentage"
                                    ? `${Number(plan.fluctuation_value)}%`
                                    : `R$ ${Number(plan.fluctuation_value)}`
                                  : "";

                              return (
                                <div key={planId} className="border rounded-md p-3 bg-white">
                                  <div className="font-medium text-xs text-muted-foreground mb-2">
                                    {plan?.name} {plan?.code && `(${plan.code})`}
                                  </div>
                                  {isDerivedWithBase && basePlan ? (
                                    <div className="space-y-2 text-sm">
                                      <div className="rounded bg-muted/60 p-2">
                                        <p className="text-xs font-medium text-muted-foreground">Tarifa Base: {basePlan.name}</p>
                                        {fluctuationLabel && (
                                          <p className="text-xs text-muted-foreground mt-0.5">Flutuação: {fluctuationLabel}</p>
                                        )}
                                        <p className="text-sm font-semibold mt-1">
                                          Preço calculado: R$ {derivedBasePrice.toFixed(2)}
                                        </p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-xs">Adulto Extra</Label>
                                          <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={priceData.adultPrice}
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              const cleanValue = value.replace(/[^\d.,]/g, "").replace(",", ".");
                                              const parts = cleanValue.split(".");
                                              const finalValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleanValue;
                                              handlePriceChange(categoryId, planId, "adultPrice", finalValue);
                                            }}
                                            placeholder="0.00"
                                            className="h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">Criança Extra</Label>
                                          <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={priceData.childPrice}
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              const cleanValue = value.replace(/[^\d.,]/g, "").replace(",", ".");
                                              const parts = cleanValue.split(".");
                                              const finalValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleanValue;
                                              handlePriceChange(categoryId, planId, "childPrice", finalValue);
                                            }}
                                            placeholder="0.00"
                                            className="h-9"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div>
                                        <Label className="text-xs">
                                          {dateMode === "specific"
                                            ? "Valor padrão (opcional — datas sem valor definido) *"
                                            : "Preço Base *"}
                                        </Label>
                                        <Input
                                          type="text"
                                          inputMode="decimal"
                                          disabled={useWeeklyPrices && dateMode !== "specific"}
                                          value={priceData.basePrice}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            const cleanValue = value.replace(/[^\d.,]/g, "").replace(",", ".");
                                            const parts = cleanValue.split(".");
                                            const finalValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleanValue;
                                            handlePriceChange(categoryId, planId, "basePrice", finalValue);
                                          }}
                                          placeholder={useWeeklyPrices ? "Usar preços por dia da semana" : "0.00"}
                                          className="h-9"
                                        />
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <Label className="text-xs">Adulto Extra</Label>
                                          <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={priceData.adultPrice}
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              const cleanValue = value.replace(/[^\d.,]/g, "").replace(",", ".");
                                              const parts = cleanValue.split(".");
                                              const finalValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleanValue;
                                              handlePriceChange(categoryId, planId, "adultPrice", finalValue);
                                            }}
                                            placeholder="0.00"
                                            className="h-9"
                                          />
                                        </div>
                                        <div>
                                          <Label className="text-xs">Criança Extra</Label>
                                          <Input
                                            type="text"
                                            inputMode="decimal"
                                            value={priceData.childPrice}
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              const cleanValue = value.replace(/[^\d.,]/g, "").replace(",", ".");
                                              const parts = cleanValue.split(".");
                                              const finalValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleanValue;
                                              handlePriceChange(categoryId, planId, "childPrice", finalValue);
                                            }}
                                            placeholder="0.00"
                                            className="h-9"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {dateMode === "specific"
                    ? "Use a seção de datas acima para valores por data; o campo padrão cobre datas sem valor individual."
                    : "Valor geral por combinação (ou use preços por dia da semana acima)"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 sm:gap-3 mt-6 pt-2 border-t sticky bottom-0 bg-background">
          <div className="w-full sm:w-auto">
            {step > 1 && (
              <Button variant="outline" onClick={handleBack} className="w-full sm:w-auto">
                Voltar
              </Button>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            {step === 1 && (
              <Button onClick={handleNextToPeriod} disabled={totalCombinations === 0} className="w-full sm:w-auto">
                Próximo
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleNextToPrice} className="w-full sm:w-auto">
                Próximo
              </Button>
            )}
            {step === 3 && (
              <Button onClick={handleSave} className="w-full sm:w-auto">
                Salvar ({totalCombinations * daysCount})
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
