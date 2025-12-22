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

  const {
    rateCalendar,
    isLoadingCalendar,
    getRateCalendarForPeriod,
    upsertRateCalendar,
    bulkUpdateRates,
    refetch: refetchRateCalendar,
    calculateRatePrice,
  } = useRateSystem();

  const { getMetricsForDate, calculateOccupancy, calculatePickupRate } = useRateMetrics();

  const visibleDates = useMemo(() => {
    return eachDayOfInterval({
      start: startDate,
      end: addDays(startDate, viewDays - 1),
    });
  }, [startDate, viewDays]);

  // Filtrar rateCalendar apenas para o plano selecionado (melhor performance)
  const filteredRateCalendar = useMemo(() => {
    if (!selectedRatePlan) return [];
    return rateCalendar.filter(r => r.pricing_plan_id === selectedRatePlan);
  }, [rateCalendar, selectedRatePlan]);

  const filteredCategories = useMemo(() => {
    if (selectedCategory === 'all') return categories;
    return categories.filter(c => c.id === selectedCategory);
  }, [categories, selectedCategory]);

  // Limpar cache quando o plano mudar
  useEffect(() => {
    setCalculatedPrices(new Map());
  }, [selectedRatePlan]);

  // Calcular preços quando o plano ou período mudar (apenas para datas sem entrada no calendário)
  useEffect(() => {
    if (!selectedRatePlan || filteredCategories.length === 0 || visibleDates.length === 0) {
      return;
    }

    const calculateMissingPrices = async () => {
      const newPrices = new Map<string, number>();
      
      // Limitar cálculo para evitar sobrecarga (apenas primeiras 3 categorias e 14 dias)
      const categoriesToProcess = filteredCategories.slice(0, 3);
      const datesToProcess = visibleDates.slice(0, 14);
      
      for (const category of categoriesToProcess) {
        for (const date of datesToProcess) {
          const dateStr = format(date, "yyyy-MM-dd");
          const key = `${selectedRatePlan}-${category.id}-${dateStr}`;
          
          // Verificar se já existe entrada no calendário para este plano específico
          const hasEntry = filteredRateCalendar.some(
            r => r.category_id === category.id &&
            r.date === dateStr &&
            r.base_price > 0
          );
          
          // Se não tem entrada, calcular usando a função
          if (!hasEntry) {
            try {
              const price = await calculateRatePrice(category.id, selectedRatePlan, date);
              if (price > 0) {
                newPrices.set(key, price);
              }
            } catch (error) {
              // Ignorar erros silenciosamente
            }
          }
        }
      }
      
      setCalculatedPrices(newPrices);
    };

    // Debounce para evitar muitas chamadas
    const timeoutId = setTimeout(calculateMissingPrices, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedRatePlan, filteredCategories, visibleDates, filteredRateCalendar, calculateRatePrice]);

  const getRateForDate = async (planId: string, categoryId: string, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const entry = rateCalendar.find(
      r => r.pricing_plan_id === planId &&
      r.category_id === categoryId &&
      r.date === dateStr
    );
    return entry?.base_price || null;
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

  // Obter informações do plano selecionado
  const selectedPlanInfo = useMemo(() => {
    return ratePlans.find(p => p.id === selectedRatePlan);
  }, [ratePlans, selectedRatePlan]);

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
                  {ratePlans.filter(p => p.is_active).map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} {plan.code && `(${plan.code})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPlanInfo && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-md border border-purple-200 dark:border-purple-800">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: selectedPlanInfo.color || '#9333EA' }}
                  ></div>
                  <span className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                    Visualizando: {selectedPlanInfo.name}
                    {selectedPlanInfo.code && ` (${selectedPlanInfo.code})`}
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
          <div className="bg-slate-100 border-b-2 border-slate-300">
            {/* Plan Info Header */}
            {selectedPlanInfo && (
              <div className="bg-purple-50 dark:bg-purple-950/20 border-b border-purple-200 dark:border-purple-800 px-4 py-2">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full" 
                    style={{ backgroundColor: selectedPlanInfo.color || '#9333EA' }}
                  ></div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-purple-900 dark:text-purple-100 text-sm">
                        Plano Tarifário:
                      </span>
                      <span className="font-bold text-purple-900 dark:text-purple-100">
                        {selectedPlanInfo.name}
                        {selectedPlanInfo.code && ` (${selectedPlanInfo.code})`}
                      </span>
                      {selectedPlanInfo.plan_type && (
                        <span className="text-xs text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded">
                          {selectedPlanInfo.plan_type}
                        </span>
                      )}
                    </div>
                    {selectedPlanInfo.description && (
                      <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                        {selectedPlanInfo.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
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
            {filteredCategories.map((category) => (
              <div key={category.id} className="flex border-b border-slate-200 hover:bg-gray-50">
                <div className="w-48 sm:w-56 flex-shrink-0 p-2 border-r border-slate-300 bg-white">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: category.color || '#3B82F6' }}></div>
                    <div>
                      <div className="font-medium text-gray-900 text-sm">{category.name}</div>
                      <div className="text-xs text-gray-500">
                        {category.rooms && Array.isArray(category.rooms) ? category.rooms.length : 0} quartos
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 flex" style={{ display: 'grid', gridTemplateColumns: `repeat(${visibleDates.length}, 1fr)` }}>
                  {visibleDates.map((date) => {
                    const dateStr = format(date, "yyyy-MM-dd");
                    // Buscar entrada específica para o plano selecionado (já filtrado)
                    const rateEntry = filteredRateCalendar.find(
                      r => r.category_id === category.id &&
                      r.date === dateStr
                    );
                    
                    // Determinar preço: primeiro do calendário, depois do cache calculado, depois base da categoria
                    let price = rateEntry?.base_price;
                    if (!price || price === 0) {
                      // Tentar buscar do cache de preços calculados
                      const cacheKey = `${selectedRatePlan}-${category.id}-${dateStr}`;
                      const cachedPrice = calculatedPrices.get(cacheKey);
                      if (cachedPrice && cachedPrice > 0) {
                        price = cachedPrice;
                      } else {
                        // Fallback: usar preço base da categoria
                        price = Number(category.base_price) || 0;
                      }
                    }
                    
                    // Usar ocupação do rate_calendar ou calcular em tempo real
                    const occupancy = rateEntry?.occupancy_percentage || 0;
                    const projectedOccupancy = rateEntry?.projected_occupancy || 0;
                    const pickupRate = rateEntry?.pickup_rate || 0;
                    const isToday = isSameDay(date, new Date());

                    return (
                      <div
                        key={date.toISOString()}
                        className={cn(
                          "border-r border-slate-200 last:border-r-0 p-2 text-center cursor-pointer group relative",
                          isToday && "bg-blue-50"
                        )}
                        onClick={() => handleCellClick(selectedRatePlan, category.id, date)}
                        style={{
                          minWidth: viewDays <= 14 ? '90px' : viewDays <= 30 ? '70px' : viewDays <= 60 ? '50px' : '40px'
                        }}
                      >
                        <div className={cn(
                          "rounded-lg p-2 transition",
                          getOccupancyColor(occupancy || projectedOccupancy),
                          "bg-opacity-10 group-hover:bg-opacity-20"
                        )}>
                          <div className="font-semibold text-gray-900 text-sm">
                            {formatCurrencyWithoutZeroCents(price)}
                          </div>
                          {(occupancy > 0 || projectedOccupancy > 0) && (
                            <div className="text-xs text-gray-600 mt-1">
                              {occupancy > 0 ? `${Math.round(occupancy)}%` : `${Math.round(projectedOccupancy)}%`} occ
                            </div>
                          )}
                          {pickupRate > 0 && (
                            <div className="text-xs text-blue-600 mt-0.5">
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
            ))}
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
        startDate={startDate}
        endDate={addDays(startDate, viewDays - 1)}
        onSave={async (data) => {
          try {
            // Aplicar edição em lote para cada categoria selecionada
            for (const categoryId of data.categoryIds) {
              await bulkUpdateRates({
                planId: data.planId,
                categoryId,
                startDate: data.startDate,
                endDate: data.endDate,
                adjustmentType: data.adjustmentType,
                adjustmentValue: data.adjustmentValue,
              });
            }
            // Refetch para atualizar o grid
            await refetchRateCalendar();
            toast.success(`Tarifas atualizadas para ${data.categoryIds.length} categoria(s)`);
          } catch (error: any) {
            toast.error(error.message || "Erro ao atualizar tarifas");
          }
        }}
      />
    </div>
  );
};

