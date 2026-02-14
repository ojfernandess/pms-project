import { useState } from "react";
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

interface ARIBulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
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

export const ARIBulkEditDialog = ({
  open,
  onOpenChange,
  categoryId,
  startDate,
  endDate,
  onSuccess,
}: ARIBulkEditDialogProps) => {
  const [activeTab, setActiveTab] = useState<BulkEditAction>('sales_status');
  
  // Sales Status
  const [salesStatus, setSalesStatus] = useState<'open' | 'closed' | 'no_price'>('closed');
  const [salesStatusReason, setSalesStatusReason] = useState('');
  
  // Inventory
  const [inventoryAction, setInventoryAction] = useState<'set' | 'add' | 'subtract'>('set');
  const [inventoryValue, setInventoryValue] = useState('');
  const [overbookingAllowed, setOverbookingAllowed] = useState('');
  
  // Price
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
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
  const { ratePlans, upsertRateCalendar, rateCalendar } = useRateSystem();

  // Calcular número de dias no intervalo
  const daysCount = dateRange.from && dateRange.to
    ? Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0;

  // Gerar array de datas
  const generateDates = (): Date[] => {
    if (!dateRange.from || !dateRange.to) return [];
    const dates: Date[] = [];
    const current = new Date(dateRange.from);
    const end = new Date(dateRange.to);
    
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  };

  // Handler para atualizar status de venda
  const handleUpdateSalesStatus = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }

    try {
      const dates = generateDates();
      await bulkUpdateSalesStatus.mutateAsync({
        categoryId,
        dates,
        status: salesStatus,
        reason: salesStatusReason || `Status alterado em massa para ${salesStatus}`,
      });
      
      toast.success(`${daysCount} datas atualizadas com sucesso`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar status: ' + error.message);
    }
  };

  // Handler para atualizar inventário
  const handleUpdateInventory = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }

    if (!inventoryValue && inventoryAction === 'set') {
      toast.error('Informe o valor do inventário');
      return;
    }

    try {
      const dates = generateDates();
      let updated = 0;

      for (const date of dates) {
        // Buscar inventário atual
        const { data: current } = await syncInventory.mutateAsync({
          categoryId,
          date,
        });

        if (current?.availability) {
          let newAvailable = current.availability.available_rooms;
          
          if (inventoryAction === 'set') {
            newAvailable = parseInt(inventoryValue) || 0;
          } else if (inventoryAction === 'add') {
            newAvailable = current.availability.available_rooms + (parseInt(inventoryValue) || 0);
          } else if (inventoryAction === 'subtract') {
            newAvailable = Math.max(0, current.availability.available_rooms - (parseInt(inventoryValue) || 0));
          }

          await updateInventory.mutateAsync({
            categoryId,
            date,
            available_rooms: newAvailable,
            overbooking_allowed: overbookingAllowed ? parseInt(overbookingAllowed) : undefined,
          });
          
          updated++;
        }
      }

      toast.success(`${updated} datas atualizadas com sucesso`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar inventário: ' + error.message);
    }
  };

  // Handler para atualizar preços
  const handleUpdatePrices = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }

    if (!selectedPlanId) {
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
      
      // Buscar preços atuais (já carregados pelo hook)
      const currentRates = rateCalendar;
      
      const updates = dateStrings.map(dateStr => {
        const currentRate = currentRates?.find(
          (r: any) => r.category_id === categoryId &&
          r.pricing_plan_id === selectedPlanId &&
          r.date === dateStr
        );

        let newPrice = parseFloat(priceValue);
        
        if (priceAction === 'add') {
          newPrice = (currentRate?.base_price || 0) + parseFloat(priceValue);
        } else if (priceAction === 'subtract') {
          newPrice = Math.max(0, (currentRate?.base_price || 0) - parseFloat(priceValue));
        } else if (priceAction === 'percentage') {
          const percentage = parseFloat(priceValue);
          newPrice = (currentRate?.base_price || 0) * (1 + percentage / 100);
        }

        return {
          establishment_id: selectedEstablishment?.id || currentRate?.establishment_id,
          pricing_plan_id: selectedPlanId,
          category_id: categoryId,
          date: dateStr,
          base_price: Math.round(newPrice * 100) / 100,
        };
      });

      await upsertRateCalendar(updates);
      
      toast.success(`${daysCount} preços atualizados com sucesso`);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error('Erro ao atualizar preços: ' + error.message);
    }
  };

  // Handler para atualizar restrições
  const handleUpdateRestrictions = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.error('Selecione um intervalo de datas');
      return;
    }

    try {
      const dates = generateDates();
      const dateStrings = dates.map(d => format(d, 'yyyy-MM-dd'));
      
      // Buscar entradas atuais do rate_calendar (já carregados pelo hook)
      const currentRates = rateCalendar;
      
      const updates = dateStrings.flatMap(dateStr => {
        // Atualizar para todos os planos ou apenas o selecionado
        const plansToUpdate = selectedPlanId 
          ? [selectedPlanId]
          : ratePlans?.map(p => p.id) || [];

        return plansToUpdate.map(planId => {
          const currentRate = currentRates?.find(
            (r: any) => r.category_id === categoryId &&
            r.pricing_plan_id === planId &&
            r.date === dateStr
          );

          return {
            establishment_id: selectedEstablishment?.id || currentRate?.establishment_id,
            pricing_plan_id: planId,
            category_id: categoryId,
            date: dateStr,
            base_price: currentRate?.base_price || 0,
            min_stay: minStay ? parseInt(minStay) : null,
            max_stay: maxStay ? parseInt(maxStay) : null,
            closed_to_arrival: closedToArrival,
            closed_to_departure: closedToDeparture,
            stop_sell_ota: stopSellOTA,
            stop_sell_booking_engine: stopSellBookingEngine,
          };
        });
      });

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

    try {
      const dates = generateDates();
      let synced = 0;

      for (const date of dates) {
        await syncInventory.mutateAsync({
          categoryId,
          date,
        });
        synced++;
      }

      toast.success(`${synced} datas sincronizadas com sucesso`);
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

        <div className="space-y-4">
          {/* Seleção de intervalo de datas */}
          <div className="space-y-2">
            <Label>Intervalo de Datas</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from && dateRange.to ? (
                    <>
                      {format(dateRange.from, "dd MMM yyyy", { locale: ptBR })} -{" "}
                      {format(dateRange.to, "dd MMM yyyy", { locale: ptBR })}
                    </>
                  ) : (
                    <span>Selecione o intervalo</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => {
                    if (range?.from) {
                      setDateRange({
                        from: range.from,
                        to: range.to || range.from,
                      });
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {daysCount > 0 && (
              <p className="text-sm text-gray-500">
                {daysCount} {daysCount === 1 ? 'dia selecionado' : 'dias selecionados'}
              </p>
            )}
          </div>

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

            {/* Preço */}
            <TabsContent value="price" className="space-y-4">
              <div className="space-y-2">
                <Label>Plano Tarifário</Label>
                <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {ratePlans?.filter(p => p.is_active).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Ação</Label>
                <Select value={priceAction} onValueChange={(v) => setPriceAction(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">Definir valor</SelectItem>
                    <SelectItem value="add">Adicionar valor</SelectItem>
                    <SelectItem value="subtract">Subtrair valor</SelectItem>
                    <SelectItem value="percentage">Ajustar percentual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Valor {priceAction === 'percentage' ? '(%)' : '(R$)'}
                </Label>
                <Input
                  type="number"
                  value={priceValue}
                  onChange={(e) => setPriceValue(e.target.value)}
                  placeholder={priceAction === 'percentage' ? 'Ex: 10 (para +10%)' : 'Ex: 50.00'}
                  step={priceAction === 'percentage' ? '1' : '0.01'}
                  min="0"
                />
              </div>
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
                    <SelectItem value="">Todos os planos</SelectItem>
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
            {isProcessing ? 'Processando...' : 'Aplicar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

