import { useState, useEffect } from "react";
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
    planIds: string[];
    startDate: Date;
    endDate: Date;
    basePrice: number;
    adultPrice?: number;
    childPrice?: number;
  }) => void;
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

  // Resetar estado quando o dialog abrir
  useEffect(() => {
    if (open) {
      setStep(1);
      setCategoryPlans({});
      setStartDate(startOfDay(new Date()));
      setEndDate(startOfDay(addDays(new Date(), 1)));
      setPrices({});
    }
  }, [open]);

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
    if (startDate > endDate) {
      toast.error("A data inicial deve ser anterior à data final");
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

    if (startDate > endDate) {
      toast.error("A data inicial deve ser anterior à data final");
      return;
    }

    // Validar que todos os preços base foram preenchidos (ou calculados para planos com Tarifa Base)
    const missingPrices: string[] = [];
    for (const categoryId of selectedCategories) {
      const planIds = categoryPlans[categoryId] || [];
      for (const planId of planIds) {
        const plan = ratePlans.find((p) => p.id === planId);
        const derivedPrice = plan ? getDerivedPlanBasePrice(categoryId, plan) : null;
        if (derivedPrice !== null && derivedPrice > 0) {
          // Plano derivado: preço calculado pela Tarifa Base + Flutuação
          continue;
        }
        const key = getPriceKey(categoryId, planId);
        const priceData = prices[key];
        const basePriceValue = priceData?.basePrice?.replace(",", ".") || "";
        if (!basePriceValue || parseFloat(basePriceValue) <= 0 || isNaN(parseFloat(basePriceValue))) {
          const categoryName = categories.find((c) => c.id === categoryId)?.name || categoryId;
          const planName = ratePlans.find((p) => p.id === planId)?.name || planId;
          const hint = plan?.base_plan_id_for_rate
            ? " (preencha o preço do plano base primeiro)"
            : "";
          missingPrices.push(`${categoryName} - ${planName}${hint}`);
        }
      }
    }

    if (missingPrices.length > 0) {
      toast.error(`Preencha o preço base para: ${missingPrices.join(', ')}`);
      return;
    }

    try {
      let savedCount = 0;
      const errors: string[] = [];

      for (const categoryId of selectedCategories) {
        const planIds = categoryPlans[categoryId] || [];
        for (const planId of planIds) {
          try {
            const plan = ratePlans.find((p) => p.id === planId);
            const key = getPriceKey(categoryId, planId);
            const priceData = prices[key];

            // Tarifa Base + Flutuação (mesma lógica da Grade ARI): usar preço calculado do plano base
            let base: number;
            const derivedPrice = plan ? getDerivedPlanBasePrice(categoryId, plan) : null;
            if (derivedPrice !== null && derivedPrice > 0) {
              base = derivedPrice;
            } else {
              const basePriceStr = (priceData?.basePrice || "0").replace(",", ".");
              base = parseFloat(basePriceStr);
            }

            if (isNaN(base) || base <= 0) {
              const categoryName = categories.find((c) => c.id === categoryId)?.name || categoryId;
              const planName = ratePlans.find((p) => p.id === planId)?.name || planId;
              errors.push(`${categoryName} - ${planName} (preço inválido)`);
              continue;
            }

            const adultPriceValue = priceData?.adultPrice
              ? parseFloat(priceData.adultPrice.replace(",", "."))
              : undefined;
            const childPriceValue = priceData?.childPrice
              ? parseFloat(priceData.childPrice.replace(",", "."))
              : undefined;

            await onSave({
              categoryId,
              planIds: [planId],
              startDate,
              endDate,
              basePrice: base,
              adultPrice: adultPriceValue && !isNaN(adultPriceValue) ? adultPriceValue : undefined,
              childPrice: childPriceValue && !isNaN(childPriceValue) ? childPriceValue : undefined,
            });
            savedCount++;
          } catch (error: any) {
            const categoryName = categories.find((c) => c.id === categoryId)?.name || categoryId;
            const planName = ratePlans.find((p) => p.id === planId)?.name || planId;
            errors.push(`${categoryName} - ${planName}`);
            console.error(`Erro ao salvar tarifa para categoria ${categoryId} e plano ${planId}:`, error);
          }
        }
      }

      const totalCombinations = selectedCategories.reduce(
        (sum, catId) => sum + (categoryPlans[catId]?.length || 0),
        0
      );

      if (savedCount > 0) {
        if (errors.length > 0) {
          toast.warning(`${savedCount} de ${totalCombinations} tarifário(s) criado(s). ${errors.length} falharam.`);
        } else {
          toast.success(`${savedCount} tarifário(s) criado(s) com sucesso!`);
        }
        onOpenChange(false);
      } else {
        toast.error("Nenhum tarifário foi criado. Verifique os erros acima.");
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
  const daysCount = differenceInDays(endDate, startDate) + 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Tarifários</DialogTitle>
          <DialogDescription>
            {step === 1 && "Selecione as categorias e os planos tarifários para cada uma"}
            {step === 2 && "Defina o período (data inicial e final)"}
            {step === 3 && "Defina o preço que será aplicado"}
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
                  {daysCount} dia(s) - {totalCombinations} combinação(ões) × {daysCount} dia(s) ={" "}
                  {totalCombinations * daysCount} tarifário(s) serão criados
                </p>
              </div>
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
                    {format(endDate, "dd/MM/yyyy", { locale: ptBR })} ({daysCount} dia(s))
                  </p>
                  <p>
                    <strong>Total de tarifários:</strong> {totalCombinations * daysCount}
                  </p>
                </div>
              </div>

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
                                        <Label className="text-xs">Preço Base *</Label>
                                        <Input
                                          type="text"
                                          inputMode="decimal"
                                          value={priceData.basePrice}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            const cleanValue = value.replace(/[^\d.,]/g, "").replace(",", ".");
                                            const parts = cleanValue.split(".");
                                            const finalValue = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleanValue;
                                            handlePriceChange(categoryId, planId, "basePrice", finalValue);
                                          }}
                                          placeholder="0.00"
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
                  Defina o preço para cada combinação de categoria e plano tarifário
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
              <Button onClick={handleNextToPrice}>
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
};
