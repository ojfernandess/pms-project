import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, X, Check, AlertCircle, Lock, Unlock, DollarSign, Users, Settings } from "lucide-react";
import { useARISystem } from "@/hooks/useARISystem";
import { useRateSystem } from "@/hooks/useRateSystem";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

interface ARIBulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId?: string | null;
  categories?: { id: string; name: string }[];
  startDate: Date;
  endDate: Date;
  onSuccess?: () => void;
}

type BulkEditAction = 
  | 'sales_status'
  | 'inventory'
  | 'price'
  | 'restrictions'
  | 'sync_inventory';

const WEEKDAYS = [
  { key: 1, label: 'Segunda' },
  { key: 2, label: 'Terça' },
  { key: 3, label: 'Quarta' },
  { key: 4, label: 'Quinta' },
  { key: 5, label: 'Sexta' },
  { key: 6, label: 'Sábado' },
  { key: 0, label: 'Domingo' },
] as const;

export const ARIBulkEditDialog = ({
  open,
  onOpenChange,
  categoryId: categoryIdProp,
  categories: categoriesProp = [],
  startDate,
  endDate,
  onSuccess,
}: ARIBulkEditDialogProps) => {
  const [activeTab, setActiveTab] = useState<BulkEditAction>('sales_status');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [changeDerivedPrices, setChangeDerivedPrices] = useState(false);

  const categories = categoriesProp?.length ? categoriesProp : (categoryIdProp ? [{ id: categoryIdProp, name: 'Categoria' }] : []);
  const isMultiCategory = !categoryIdProp && categories.length > 1;
  const effectiveCategoryIds = categoryIdProp ? [categoryIdProp] : (selectedCategoryIds.size > 0 ? Array.from(selectedCategoryIds) : categories.map((c: { id: string }) => c.id));

  useEffect(() => {
    if (open && categories.length > 0) {
      if (categoryIdProp) {
        setSelectedCategoryIds(new Set([categoryIdProp]));
      } else {
        setSelectedCategoryIds(new Set(categories.map((c: { id: string }) => c.id)));
      }
    }
  }, [open, categoryIdProp, categories]);



  const generateDates = (): Date[] => {
    if (!dateRange.from || !dateRange.to) return [];
    const dates: Date[] = [];
    const current = new Date(dateRange.from);
    const end = new Date(dateRange.to);
    while (current <= end) {
      const dow = current.getDay();
      if (selectedDayOfWeek.size === 0 || selectedDayOfWeek.has(dow)) {
        dates.push(new Date(current));
      }
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };
  
  // Sales Status
  const [salesStatus, setSalesStatus] = useState<'open' | 'closed' | 'no_price'>('closed');
  const [salesStatusReason, setSalesStatusReason] = useState('');
  
  // Inventory
  const [inventoryAction, setInventoryAction] = useState<'set' | 'add' | 'subtract'>('set');
  const [inventoryValue, setInventoryValue] = useState('');
  const [overbookingAllowed, setOverbookingAllowed] = useState('');
  
  // Price
  const [selectedPlanId, setSelectedPlanId] = useState<string>('__all__');
  const [priceAction, setPriceAction] = useState<'set' | 'add' | 'subtract' | 'percentage'>('set');
  const [priceValue, setPriceValue] = useState('');
  
  // Restrictions
  const [minStay, setMinStay] = useState('');
  const [maxStay, setMaxStay] = useState('');
  const [closedToArrival, setClosedToArrival] = useState(false);
  const [closedToDeparture, setClosedToDeparture] = useState(false);
  const [stopSellOTA, setStopSellOTA] = useState(false);
  const [stopSellBookingEngine, setStopSellBookingEngine] = useState(false);
  
  // Date Range
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startDate,
    to: endDate,
  });

  const { selectedEstablishment } = useEstablishment();
  const { bulkUpdateSalesStatus, updateInventory, syncInventory } = useARISystem();
  const rateCalendarDateRange = dateRange.from && dateRange.to
    ? { start: dateRange.from, end: dateRange.to }
    : undefined;
  const { ratePlans, upsertRateCalendar, rateCalendar } = useRateSystem({ dateRange: rateCalendarDateRange });

  // Calcular número de dias no intervalo
  const daysCount = dateRange.from && dateRange.to
    ? Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  // Handler para atualizar status de venda
  const handleUpdateSalesStatus = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }
    if (effectiveCategoryIds.length === 0) {
      toast.error('Selecione ao menos uma categoria');
      return;
    }

    try {
      const dates = generateDates();
      for (const catId of effectiveCategoryIds) {
        await bulkUpdateSalesStatus.mutateAsync({
          categoryId: catId,
          dates,
          status: salesStatus,
          reason: salesStatusReason || `Status alterado em massa para ${salesStatus}`,
        });
      }
      toast.success(`${daysCount} datas atualizadas para ${effectiveCategoryIds.length} categorias`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar status: ' + (error as Error).message);
    }
  };

  // Handler para atualizar inventário
  const handleUpdateInventory = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }
    if (effectiveCategoryIds.length === 0) {
      toast.error('Selecione ao menos uma categoria');
      return;
    }
    if (!inventoryValue && inventoryAction === 'set') {
      toast.error('Informe o valor do inventário');
      return;
    }

    try {
      const dates = generateDates();
      let updated = 0;

      for (const catId of effectiveCategoryIds) {
        for (const date of dates) {
          const { data: current } = await syncInventory.mutateAsync({ categoryId: catId, date });
          if (current?.availability) {
            let newAvailable = current.availability.available_rooms;
            if (inventoryAction === 'set') newAvailable = parseInt(inventoryValue) || 0;
            else if (inventoryAction === 'add') newAvailable += parseInt(inventoryValue) || 0;
            else if (inventoryAction === 'subtract') newAvailable = Math.max(0, newAvailable - (parseInt(inventoryValue) || 0));
            await updateInventory.mutateAsync({
              categoryId: catId,
              date,
              available_rooms: newAvailable,
              overbooking_allowed: overbookingAllowed ? parseInt(overbookingAllowed) : undefined,
            });
            updated++;
          }
        }
      }

      toast.success(`${updated} datas atualizadas com sucesso`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar inventário: ' + (error as Error).message);
    }
  };

  // Handler para atualizar preços
  const handleUpdatePrices = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }
    if (effectiveCategoryIds.length === 0) {
      toast.error('Selecione ao menos uma categoria');
      return;
    }
    if (!selectedPlanId || selectedPlanId === '__all__') {
      toast.error('Selecione um plano tarifário');
      return;
    }
    if (!priceValue) {
      toast.error('Informe o valor do preço');
      return;
    }

    try {
      const dates = generateDates();
      const dateStrings = dates.map(d => format(d, 'yyyy-MM-dd'));
      const currentRates = rateCalendar ?? [];
      const selectedPlan = ratePlans?.find((p: { id: string; base_plan_id_for_rate?: string; fluctuation_type?: string; fluctuation_value?: number }) => p.id === selectedPlanId);
      const isSelectedBasePlan = !selectedPlan?.base_plan_id_for_rate;

      const plansToUpdate: string[] = changeDerivedPrices && isSelectedBasePlan
        ? [
            selectedPlanId,
            ...(ratePlans?.filter((p: { base_plan_id_for_rate?: string; is_active?: boolean }) =>
              p.base_plan_id_for_rate === selectedPlanId && p.is_active !== false
            ).map((p: { id: string }) => p.id) ?? []),
          ]
        : [selectedPlanId];

      const updates: { establishment_id?: string; pricing_plan_id: string; category_id: string; date: string; base_price: number }[] = [];

      for (const catId of effectiveCategoryIds) {
        for (const dateStr of dateStrings) {
          const estId = selectedEstablishment?.id;

          const getPriceForPlan = (planId: string, sourcePlanId: string): number => {
            const entry = currentRates.find(
              (r: { category_id: string; pricing_plan_id: string; date: string; base_price?: number }) =>
                r.category_id === catId && r.pricing_plan_id === sourcePlanId && r.date === dateStr
            );
            return Number(entry?.base_price ?? 0);
          };

          const basePlanPrice = getPriceForPlan(selectedPlanId, selectedPlanId);
          let newBasePlanPrice = parseFloat(priceValue);
          if (priceAction === 'add') newBasePlanPrice = basePlanPrice + parseFloat(priceValue);
          else if (priceAction === 'subtract') newBasePlanPrice = Math.max(0, basePlanPrice - parseFloat(priceValue));
          else if (priceAction === 'percentage') newBasePlanPrice = basePlanPrice * (1 + parseFloat(priceValue) / 100);

          for (const planId of plansToUpdate) {
            const plan = ratePlans?.find((p: { id: string }) => p.id === planId);
            let finalPrice: number;
            if (planId === selectedPlanId) {
              finalPrice = newBasePlanPrice;
            } else if (plan?.base_plan_id_for_rate === selectedPlanId && plan?.fluctuation_type && plan?.fluctuation_value != null) {
              if (plan.fluctuation_type === 'percentage') {
                finalPrice = newBasePlanPrice * (1 + Number(plan.fluctuation_value) / 100);
              } else {
                finalPrice = newBasePlanPrice + Number(plan.fluctuation_value);
              }
            } else {
              const current = getPriceForPlan(planId, planId);
              finalPrice = priceAction === 'set' ? parseFloat(priceValue)
                : priceAction === 'add' ? current + parseFloat(priceValue)
                : priceAction === 'subtract' ? Math.max(0, current - parseFloat(priceValue))
                : current * (1 + parseFloat(priceValue) / 100);
            }

            const currentRate = currentRates?.find(
              (r: { category_id: string; pricing_plan_id: string; date: string; establishment_id?: string }) =>
                r.category_id === catId && r.pricing_plan_id === planId && r.date === dateStr
            );
            updates.push({
              establishment_id: estId || (currentRate as { establishment_id?: string })?.establishment_id,
              pricing_plan_id: planId,
              category_id: catId,
              date: dateStr,
              base_price: Math.round(finalPrice * 100) / 100,
            });
          }
        }
      }

      await upsertRateCalendar(updates);
      toast.success(`${updates.length} preços atualizados com sucesso`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar preços: ' + (error as Error).message);
    }
  };

  // Handler para atualizar restrições
  const handleUpdateRestrictions = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }
    if (effectiveCategoryIds.length === 0) {
      toast.error('Selecione ao menos uma categoria');
      return;
    }

    try {
      const dates = generateDates();
      const dateStrings = dates.map(d => format(d, 'yyyy-MM-dd'));
      const currentRates = rateCalendar ?? [];
      const plansToUpdate = (selectedPlanId && selectedPlanId !== '__all__')
        ? [selectedPlanId]
        : ratePlans?.map((p: { id: string }) => p.id) || [];

      const updates: { establishment_id?: string; pricing_plan_id: string; category_id: string; date: string; base_price: number; min_stay?: number | null; max_stay?: number | null; closed_to_arrival?: boolean; closed_to_departure?: boolean; stop_sell_ota?: boolean; stop_sell_booking_engine?: boolean }[] = [];

      for (const catId of effectiveCategoryIds) {
        for (const dateStr of dateStrings) {
          for (const planId of plansToUpdate) {
            const currentRate = currentRates?.find(
              (r: { category_id: string; pricing_plan_id: string; date: string; establishment_id?: string; base_price?: number }) =>
                r.category_id === catId && r.pricing_plan_id === planId && r.date === dateStr
            );
            updates.push({
              establishment_id: selectedEstablishment?.id || (currentRate?.establishment_id as string),
              pricing_plan_id: planId,
              category_id: catId,
              date: dateStr,
              base_price: currentRate?.base_price ?? 0,
              min_stay: minStay ? parseInt(minStay) : null,
              max_stay: maxStay ? parseInt(maxStay) : null,
              closed_to_arrival: closedToArrival,
              closed_to_departure: closedToDeparture,
              stop_sell_ota: stopSellOTA,
              stop_sell_booking_engine: stopSellBookingEngine,
            });
          }
        }
      }

      await upsertRateCalendar(updates);
      
      toast.success(`${daysCount} restrições atualizadas com sucesso`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar restrições: ' + error.message);
    }
  };

  // Handler para sincronizar inventário
  const handleSyncInventory = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }
    if (effectiveCategoryIds.length === 0) {
      toast.error('Selecione ao menos uma categoria');
      return;
    }

    try {
      const dates = generateDates();
      let synced = 0;

      for (const catId of effectiveCategoryIds) {
        for (const date of dates) {
          await syncInventory.mutateAsync({
            categoryId: catId,
            date,
          });
          synced++;
        }
      }

      toast.success(`${synced} sincronizações concluídas`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao sincronizar inventário: ' + error.message);
    }
  };

  const handleSubmit = () => {
    switch (activeTab) {
      case 'sales_status':
        handleUpdateSalesStatus();
        break;
      case 'inventory':
        handleUpdateInventory();
        break;
      case 'price':
        handleUpdatePrices();
        break;
      case 'restrictions':
        handleUpdateRestrictions();
        break;
      case 'sync_inventory':
        handleSyncInventory();
        break;
    }
  };

  const isProcessing = 
    bulkUpdateSalesStatus.isPending ||
    updateInventory.isPending ||
    syncInventory.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edição em Massa - ARI</DialogTitle>
          <DialogDescription>
            Aplique alterações em múltiplas datas de uma vez
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* A partir de / Até — intervalo de datas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>A partir de</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? format(dateRange.from, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(d) => d && setDateRange(prev => ({ ...prev, from: d }))}
                    disabled={(d) => dateRange.to && d > dateRange.to}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Até</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? format(dateRange.to, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(d) => d && setDateRange(prev => ({ ...prev, to: d }))}
                    disabled={(d) => dateRange.from && d < dateRange.from}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {daysCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {daysCount} {daysCount === 1 ? 'dia' : 'dias'} no intervalo
              {daysCount > 60 && (
                <span className="block text-amber-600 mt-1">Máx. 60 dias carregados por vez para desempenho.</span>
              )}
            </p>
          )}

          {/* Dias da semana */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Dias da semana</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedDayOfWeek(selectedDayOfWeek.size === 7 ? new Set() : new Set([0, 1, 2, 3, 4, 5, 6]))}
              >
                {selectedDayOfWeek.size === 7 ? "Desmarcar todos" : "Marcar todos"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedDayOfWeek.has(key)}
                    onCheckedChange={(c) => {
                      const next = new Set(selectedDayOfWeek);
                      if (c) next.add(key); else next.delete(key);
                      setSelectedDayOfWeek(next);
                    }}
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Categorias — quando múltiplas */}
          {isMultiCategory && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Categorias</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedCategoryIds(selectedCategoryIds.size === categories.length ? new Set() : new Set(categories.map((c: { id: string }) => c.id)))}
                >
                  {selectedCategoryIds.size === categories.length ? "Desmarcar todas" : "Marcar todas"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-3 max-h-24 overflow-y-auto">
                {categories.map((cat: { id: string; name: string }) => (
                  <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedCategoryIds.has(cat.id)}
                      onCheckedChange={(c) => {
                        const next = new Set(selectedCategoryIds);
                        if (c) next.add(cat.id); else next.delete(cat.id);
                        setSelectedCategoryIds(next);
                      }}
                    />
                    <span className="text-sm">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Tabs de ações */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as BulkEditAction)}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="sales_status" className="text-xs">
                <Lock className="w-3 h-3 mr-1" />
                Status
              </TabsTrigger>
              <TabsTrigger value="inventory" className="text-xs">
                <Users className="w-3 h-3 mr-1" />
                Inventário
              </TabsTrigger>
              <TabsTrigger value="price" className="text-xs">
                <DollarSign className="w-3 h-3 mr-1" />
                Preço
              </TabsTrigger>
              <TabsTrigger value="restrictions" className="text-xs">
                <Settings className="w-3 h-3 mr-1" />
                Restrições
              </TabsTrigger>
              <TabsTrigger value="sync_inventory" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Sincronizar
              </TabsTrigger>
            </TabsList>

            {/* Status de Venda */}
            <TabsContent value="sales_status" className="space-y-4">
              <div className="space-y-2">
                <Label>Status de Venda</Label>
                <Select value={salesStatus} onValueChange={(v) => setSalesStatus(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded" />
                        Disponível
                      </div>
                    </SelectItem>
                    <SelectItem value="closed">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded" />
                        Fechado
                      </div>
                    </SelectItem>
                    <SelectItem value="no_price">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-500 rounded" />
                        Sem Preço
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Motivo (opcional)</Label>
                <Textarea
                  value={salesStatusReason}
                  onChange={(e) => setSalesStatusReason(e.target.value)}
                  placeholder="Ex: Fechado para manutenção"
                  rows={3}
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Atenção:</strong> Esta ação irá {salesStatus === 'closed' ? 'fechar' : salesStatus === 'open' ? 'abrir' : 'remover preço de'}{' '}
                  {daysCount} {daysCount === 1 ? 'data' : 'datas'} para esta categoria.
                </p>
              </div>
            </TabsContent>

            {/* Inventário */}
            <TabsContent value="inventory" className="space-y-4">
              <div className="space-y-2">
                <Label>Ação</Label>
                <Select value={inventoryAction} onValueChange={(v) => setInventoryAction(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">Definir valor</SelectItem>
                    <SelectItem value="add">Adicionar</SelectItem>
                    <SelectItem value="subtract">Subtrair</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Valor {inventoryAction === 'set' ? '' : `(${inventoryAction === 'add' ? '+' : '-'})`}</Label>
                <Input
                  type="number"
                  value={inventoryValue}
                  onChange={(e) => setInventoryValue(e.target.value)}
                  placeholder="Ex: 5"
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <Label>Overbooking Permitido (opcional)</Label>
                <Input
                  type="number"
                  value={overbookingAllowed}
                  onChange={(e) => setOverbookingAllowed(e.target.value)}
                  placeholder="Ex: 2"
                  min="0"
                />
                <p className="text-xs text-gray-500">
                  Número de quartos que podem ser vendidos além do inventário disponível
                </p>
              </div>
            </TabsContent>

            {/* Preço — Definir Preços */}
            <TabsContent value="price" className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="change-derived"
                  checked={changeDerivedPrices}
                  onCheckedChange={(c) => setChangeDerivedPrices(!!c)}
                />
                <label htmlFor="change-derived" className="text-sm font-medium cursor-pointer">
                  Alterar preço das tarifas derivadas?
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {changeDerivedPrices
                  ? 'Ao alterar um plano base, as tarifas derivadas (ex: Não Reembolsável) serão atualizadas com a flutuação definida.'
                  : 'Será alterado apenas o plano selecionado.'}
              </p>

              <div className="space-y-2">
                <Label>Planos de Tarifa</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {ratePlans?.filter((p: { is_active: boolean }) => p.is_active).map((plan: { id: string; name: string; base_plan_id_for_rate?: string }) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.base_plan_id_for_rate ? '↳ ' : '✓ '}{plan.name}
                        {plan.base_plan_id_for_rate ? ' (derivado)' : ' (base)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Tabs value={priceAction === 'set' ? 'fixed' : 'add'} onValueChange={(v) => {
                if (v === 'fixed') { setPriceAction('set'); setPriceValue(''); }
                else { setPriceAction('percentage'); setPriceValue(''); }
              }} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="fixed">Preço Fixo</TabsTrigger>
                  <TabsTrigger value="add">Adicionar Valor aos Preços</TabsTrigger>
                </TabsList>
                <TabsContent value="fixed" className="space-y-2 mt-3">
                  <p className="text-xs text-muted-foreground">Atualize o preço padrão de todas as tarifas selecionadas</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">R$</span>
                    <Input
                      type="number"
                      value={priceValue}
                      onChange={(e) => { setPriceValue(e.target.value); setPriceAction('set'); }}
                      placeholder="0,00"
                      step="0.01"
                      min="0"
                    />
                  </div>
                </TabsContent>
                <TabsContent value="add" className="space-y-2 mt-3">
                  <p className="text-xs text-muted-foreground">Adicione valor fixo ou percentual aos preços existentes</p>
                  <Select value={priceAction} onValueChange={(v) => setPriceAction(v as 'add' | 'subtract' | 'percentage')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Adicionar (R$ ou %)</SelectItem>
                      <SelectItem value="subtract">Subtrair (R$)</SelectItem>
                      <SelectItem value="percentage">Ajustar percentual (%)</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{priceAction === 'percentage' ? '%' : 'R$'}</span>
                    <Input
                      type="number"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      placeholder={priceAction === 'percentage' ? 'Ex: -5' : 'Ex: 50'}
                      step={priceAction === 'percentage' ? '1' : '0.01'}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Restrições */}
            <TabsContent value="restrictions" className="space-y-4">
              <div className="space-y-2">
                <Label>Plano Tarifário (opcional)</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os planos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os planos</SelectItem>
                    {ratePlans?.filter(p => p.is_active).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Deixe vazio para aplicar a todos os planos
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Stay (noites mínimas)</Label>
                  <Input
                    type="number"
                    value={minStay}
                    onChange={(e) => setMinStay(e.target.value)}
                    placeholder="Ex: 2"
                    min="0"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Max Stay (noites máximas)</Label>
                  <Input
                    type="number"
                    value={maxStay}
                    onChange={(e) => setMaxStay(e.target.value)}
                    placeholder="Ex: 7"
                    min="0"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Fechado para Chegada (CTA)</Label>
                  <Switch
                    checked={closedToArrival}
                    onCheckedChange={setClosedToArrival}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Fechado para Saída (CTD)</Label>
                  <Switch
                    checked={closedToDeparture}
                    onCheckedChange={setClosedToDeparture}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Stop Sell OTA</Label>
                  <Switch
                    checked={stopSellOTA}
                    onCheckedChange={setStopSellOTA}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Stop Sell Motor de Reservas</Label>
                  <Switch
                    checked={stopSellBookingEngine}
                    onCheckedChange={setStopSellBookingEngine}
                  />
                </div>
              </div>
            </TabsContent>

            {/* Sincronizar Inventário */}
            <TabsContent value="sync_inventory" className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      Sincronizar Inventário
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Esta ação irá recalcular o inventário para {daysCount} {daysCount === 1 ? 'data' : 'datas'} baseado nas reservas atuais e status dos quartos.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>O que será atualizado:</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 list-disc list-inside space-y-1">
                  <li>Quartos disponíveis (baseado em reservas confirmadas)</li>
                  <li>Reservas efetivas (check-in realizado)</li>
                  <li>Quartos bloqueados (manutenção, etc)</li>
                  <li>Ocupação percentual</li>
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing || daysCount === 0}>
            {isProcessing ? 'Salvando...' : 'Salvar Informações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

