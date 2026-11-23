import { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfDay, addDays, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { RatePlan } from "@/hooks/useRateSystem";
import { toast } from "sonner";
import { RateDaySelectionFields } from "@/components/rate-system/RateDaySelectionFields";
import {
  eachDateStringInRange,
  filterDatesBySelection,
  validateRateDateSelection,
  type RateDateSelectionMode,
} from "@/lib/rateEditorDaySelection";

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlan: string;
  categories: any[];
  ratePlans: RatePlan[];
  startDate: Date;
  endDate: Date;
  onSave: (data: {
    categoryPlans: Array<{
      categoryId: string;
    planId: string;
      adjustmentType: 'percentage' | 'fixed' | 'replace';
      adjustmentValue: number;
    }>;
    startDate: Date;
    endDate: Date;
    applicableDates: string[];
  }) => Promise<void>;
}

export const BulkEditDialog = memo(({
  open,
  onOpenChange,
  selectedPlan,
  categories,
  ratePlans,
  startDate,
  endDate,
  onSave,
}: BulkEditDialogProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Categorias e Planos, 2: Período, 3: Valores
  const [categoryPlans, setCategoryPlans] = useState<Record<string, string[]>>({}); // categoriaId -> planIds[]
  const [bulkStartDate, setBulkStartDate] = useState<Date>(startOfDay(new Date(startDate)));
  const [bulkEndDate, setBulkEndDate] = useState<Date>(startOfDay(new Date(endDate)));
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<'percentage' | 'fixed' | 'replace'>('percentage');
  const [prices, setPrices] = useState<Record<string, { adjustmentType: 'percentage' | 'fixed' | 'replace'; adjustmentValue: string }>>({});
  const [dateMode, setDateMode] = useState<RateDateSelectionMode>("all");
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3, 4, 5, 6]),
  );
  const [specificDates, setSpecificDates] = useState<Set<string>>(() => new Set());
  const prevOpenRef = useRef(false);

  // Resetar estado quando o dialog abrir
  useEffect(() => {
    if (open) {
      if (!prevOpenRef.current) {
        setStep(1);
        setCategoryPlans({});
        setBulkStartDate(startOfDay(new Date(startDate)));
        setBulkEndDate(startOfDay(new Date(endDate)));
        setPrices({});
        setAdjustmentType('percentage');
        setStartDateOpen(false);
        setEndDateOpen(false);
        setDateMode("all");
        setSelectedWeekdays(new Set([0, 1, 2, 3, 4, 5, 6]));
        setSpecificDates(new Set());
      }
      prevOpenRef.current = true;
    } else {
      prevOpenRef.current = false;
    }
  }, [open, startDate, endDate]);

  const handleCategoryToggle = useCallback((categoryId: string, checked: boolean) => {
    if (checked) {
      setCategoryPlans((prev) => ({
        ...prev,
        [categoryId]: [],
      }));
    } else {
      setCategoryPlans((prev) => {
        const newState = { ...prev };
        delete newState[categoryId];
        // Remover preços relacionados
        setPrices((prevPrices) => {
          const newPrices = { ...prevPrices };
          Object.keys(newPrices).forEach((key) => {
            if (key.startsWith(`${categoryId}-`)) {
              delete newPrices[key];
            }
          });
          return newPrices;
        });
        return newState;
      });
    }
  }, []);

  const handlePlanToggleForCategory = useCallback((categoryId: string, planId: string, checked: boolean) => {
    setCategoryPlans((prev) => {
      const currentPlans = prev[categoryId] || [];
      if (checked) {
        return {
          ...prev,
          [categoryId]: [...currentPlans, planId],
        };
      } else {
        // Remover preço relacionado
        const key = `${categoryId}-${planId}`;
        setPrices((prevPrices) => {
          const newPrices = { ...prevPrices };
          delete newPrices[key];
          return newPrices;
        });
        return {
          ...prev,
          [categoryId]: currentPlans.filter((id) => id !== planId),
        };
      }
    });
  }, []);

  const handleSelectAllPlansForCategory = useCallback((categoryId: string) => {
    const activePlans = ratePlans.filter((p) => p.is_active).map((p) => p.id);
    const currentPlans = categoryPlans[categoryId] || [];
    const allSelected = activePlans.length > 0 && activePlans.every((id) => currentPlans.includes(id));

    setCategoryPlans((prev) => ({
      ...prev,
      [categoryId]: allSelected ? [] : activePlans,
    }));
  }, [ratePlans, categoryPlans]);

  const handleSelectAllCategories = useCallback(() => {
    const allCategoryIds = categories.map((c) => c.id);
    const allSelected = allCategoryIds.every((id) => categoryPlans[id] !== undefined);
      
      if (allSelected) {
      setCategoryPlans({});
      setPrices({});
      } else {
      const newState: Record<string, string[]> = {};
      allCategoryIds.forEach((id) => {
        newState[id] = [];
      });
      setCategoryPlans(newState);
    }
  }, [categories, categoryPlans]);

  const handleNextToPeriod = () => {
    const selectedCategories = Object.keys(categoryPlans);
    if (selectedCategories.length === 0) {
      toast.error("Selecione pelo menos uma categoria");
      return;
    }

    const categoriesWithoutPlans = selectedCategories.filter(
      (catId) => !categoryPlans[catId] || categoryPlans[catId].length === 0
    );

    if (categoriesWithoutPlans.length > 0) {
      toast.error("Todas as categorias selecionadas devem ter pelo menos um plano tarifário");
      return;
      }

    setStep(2);
  };

  const applicableDates = useMemo(() => {
    const all = eachDateStringInRange(bulkStartDate, bulkEndDate);
    return filterDatesBySelection(all, dateMode, selectedWeekdays, specificDates);
  }, [bulkStartDate, bulkEndDate, dateMode, selectedWeekdays, specificDates]);

  const toggleWeekday = useCallback((dow: number, checked: boolean) => {
    setSelectedWeekdays((prev) => {
      const next = new Set(prev);
      if (checked) next.add(dow);
      else next.delete(dow);
      return next;
    });
  }, []);

  const toggleSpecificDate = useCallback((dateStr: string) => {
    setSpecificDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }, []);

  const handleNextToValues = () => {
    const err = validateRateDateSelection({
      startDate: bulkStartDate,
      endDate: bulkEndDate,
      mode: dateMode,
      selectedWeekdays,
      specificDates,
    });
    if (err) {
      toast.error(err);
      return;
    }
    setStep(3);
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

  const handlePriceChange = (categoryId: string, planId: string, field: 'adjustmentType' | 'adjustmentValue', value: string | 'percentage' | 'fixed' | 'replace') => {
    const key = getPriceKey(categoryId, planId);
    setPrices((prev) => {
      const currentPrice = prev[key] || { adjustmentType: adjustmentType, adjustmentValue: '' };
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

    if (bulkStartDate > bulkEndDate) {
      toast.error("A data inicial deve ser anterior à data final");
      return;
    }

    // Validar que todos os valores foram preenchidos
    const missingValues: string[] = [];
    const categoryPlansData: Array<{
      categoryId: string;
      planId: string;
      adjustmentType: 'percentage' | 'fixed' | 'replace';
      adjustmentValue: number;
    }> = [];

    for (const categoryId of selectedCategories) {
      const planIds = categoryPlans[categoryId] || [];
      for (const planId of planIds) {
        const key = getPriceKey(categoryId, planId);
        const priceData = prices[key];
        const adjType = priceData?.adjustmentType || adjustmentType;
        const adjValueStr = priceData?.adjustmentValue?.replace(',', '.') || '';
        
        if (!adjValueStr || parseFloat(adjValueStr) === 0 || isNaN(parseFloat(adjValueStr))) {
          const categoryName = categories.find((c) => c.id === categoryId)?.name || categoryId;
          const planName = ratePlans.find((p) => p.id === planId)?.name || planId;
          missingValues.push(`${categoryName} - ${planName}`);
        } else {
          categoryPlansData.push({
            categoryId,
            planId,
            adjustmentType: adjType,
            adjustmentValue: parseFloat(adjValueStr),
          });
        }
      }
    }

    if (missingValues.length > 0) {
      toast.error(`Preencha o valor para: ${missingValues.join(', ')}`);
      return;
    }

    try {
    await onSave({
        categoryPlans: categoryPlansData,
      startDate: bulkStartDate,
      endDate: bulkEndDate,
      applicableDates,
    });
    onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar edição em lote:", error);
      toast.error(error.message || "Erro ao atualizar tarifas");
    }
  };

  const activePlans = ratePlans.filter((p) => p.is_active);
  const selectedCategories = Object.keys(categoryPlans);
  const totalCombinations = selectedCategories.reduce(
    (sum, catId) => sum + (categoryPlans[catId]?.length || 0),
    0
  );
  const daysCount = applicableDates.length;
  const periodDaysCount = differenceInDays(bulkEndDate, bulkStartDate) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edição em Lote</DialogTitle>
          <DialogDescription>
            {step === 1 && "Selecione as categorias e os planos tarifários para cada uma"}
            {step === 2 && "Defina o período (data inicial e final)"}
            {step === 3 && "Defina o tipo de ajuste e valor para cada combinação"}
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
                                const basePlan = plan.base_plan_id_for_rate
                                  ? ratePlans.find((p) => p.id === plan.base_plan_id_for_rate)
                                  : null;
                                const fluctuationLabel =
                                  plan.fluctuation_type && plan.fluctuation_value != null
                                    ? plan.fluctuation_type === "percentage"
                                      ? `${Number(plan.fluctuation_value)}%`
                                      : `R$ ${Number(plan.fluctuation_value)}`
                                    : "";
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
                                      {basePlan && fluctuationLabel && (
                                        <span className="block text-muted-foreground font-normal mt-0.5">
                                          Tarifa Base: {basePlan.name} · Flutuação: {fluctuationLabel}
                                        </span>
                                      )}
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
                    {format(bulkStartDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bulkStartDate}
                      onSelect={(selectedDate) => {
                        if (selectedDate) {
                          setBulkStartDate(startOfDay(selectedDate));
                        setStartDateOpen(false);
                          if (selectedDate > bulkEndDate) {
                            setBulkEndDate(startOfDay(addDays(selectedDate, 1)));
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
                    {format(bulkEndDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bulkEndDate}
                      onSelect={(selectedDate) => {
                        if (selectedDate) {
                          if (selectedDate < bulkStartDate) {
                            toast.error("A data final deve ser posterior à data inicial");
                            return;
                          }
                          setBulkEndDate(startOfDay(selectedDate));
                        setEndDateOpen(false);
                      }
                    }}
                    initialFocus
                    locale={ptBR}
                      disabled={(date) => date < bulkStartDate}
                  />
                </PopoverContent>
              </Popover>
          </div>

              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">
                  Período: {format(bulkStartDate, "dd/MM/yyyy", { locale: ptBR })} até{" "}
                  {format(bulkEndDate, "dd/MM/yyyy", { locale: ptBR })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Período: {periodDaysCount} dia(s) · {daysCount} dia(s) selecionado(s) · até{" "}
                  {totalCombinations * daysCount} atualização(ões)
                </p>
            </div>

              <RateDaySelectionFields
                startDate={bulkStartDate}
                endDate={bulkEndDate}
                dateMode={dateMode}
                onDateModeChange={setDateMode}
                selectedWeekdays={selectedWeekdays}
                onToggleWeekday={toggleWeekday}
                specificDates={specificDates}
                onToggleSpecificDate={toggleSpecificDate}
                onSelectAllSpecific={() =>
                  setSpecificDates(new Set(eachDateStringInRange(bulkStartDate, bulkEndDate)))
                }
                onClearSpecific={() => setSpecificDates(new Set())}
              />
            </div>
          )}

          {/* Step 3: Definir Valores */}
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
                    <strong>Período:</strong> {format(bulkStartDate, "dd/MM/yyyy", { locale: ptBR })} até{" "}
                    {format(bulkEndDate, "dd/MM/yyyy", { locale: ptBR })} ({daysCount} dia(s))
                  </p>
                  <p>
                    <strong>Total de tarifários:</strong> {totalCombinations * daysCount}
                  </p>
            </div>
          </div>

          <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Tipo de Ajuste Padrão</Label>
                  <p className="text-xs text-muted-foreground">Pode ser alterado individualmente abaixo</p>
                </div>
            <Select value={adjustmentType} onValueChange={(v: any) => setAdjustmentType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                    <SelectItem value="percentage">Percentual (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                    <SelectItem value="replace">Substituir Valor (R$)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
                <Label className="mb-3 block">Valores por Categoria e Plano Tarifário *</Label>
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
                          {planIds.map((planId) => {
                            const plan = ratePlans.find((p) => p.id === planId);
                            const key = getPriceKey(categoryId, planId);
                            const priceData = prices[key] || { adjustmentType: adjustmentType, adjustmentValue: '' };
                            
                            const getPlaceholder = () => {
                              if (priceData.adjustmentType === 'percentage') {
                                return "Ex: 10 para +10%";
                              } else if (priceData.adjustmentType === 'fixed') {
                                return "Ex: 50 para +R$ 50";
                              } else {
                                return "Ex: 250 para R$ 250";
                              }
                            };
                            
                            const basePlan = plan?.base_plan_id_for_rate
                              ? ratePlans.find((p) => p.id === plan.base_plan_id_for_rate)
                              : null;
                            const fluctuationLabel =
                              plan?.fluctuation_type != null && plan?.fluctuation_value != null
                                ? plan.fluctuation_type === "percentage"
                                  ? `${Number(plan.fluctuation_value)}%`
                                  : `R$ ${Number(plan.fluctuation_value)}`
                                : "";

                            return (
                              <div key={planId} className="border rounded-md p-3 bg-white">
                                <div className="font-medium text-xs text-muted-foreground mb-2">
                                  {plan?.name} {plan?.code && `(${plan.code})`}
                                  {basePlan && fluctuationLabel && (
                                    <span className="block text-muted-foreground font-normal mt-1">
                                      Tarifa Base: {basePlan.name} · Flutuação: {fluctuationLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <Label className="text-xs">Tipo de Ajuste</Label>
                                    <Select 
                                      value={priceData.adjustmentType} 
                                      onValueChange={(v: any) => handlePriceChange(categoryId, planId, 'adjustmentType', v)}
                                    >
                                      <SelectTrigger className="h-9">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="percentage">Percentual (%)</SelectItem>
                                        <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                                        <SelectItem value="replace">Substituir Valor (R$)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Valor *</Label>
            <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={priceData.adjustmentValue}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const cleanValue = value.replace(/[^\d.,]/g, '').replace(',', '.');
                                        const parts = cleanValue.split('.');
                                        const finalValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : cleanValue;
                                        handlePriceChange(categoryId, planId, 'adjustmentValue', finalValue);
                                      }}
              placeholder={getPlaceholder()}
                                      className="h-9"
            />
          </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Defina o tipo de ajuste e valor para cada combinação de categoria e plano tarifário
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between gap-3 mt-6">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={handleBack}>
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
            {step === 1 && (
              <Button onClick={handleNextToPeriod} disabled={totalCombinations === 0}>
                Próximo
              </Button>
            )}
            {step === 2 && (
              <Button onClick={handleNextToValues}>
                Próximo
              </Button>
            )}
            {step === 3 && (
          <Button onClick={handleSave}>
                Salvar ({totalCombinations * daysCount})
          </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

BulkEditDialog.displayName = "BulkEditDialog";
