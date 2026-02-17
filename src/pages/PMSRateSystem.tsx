import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, DollarSign, Settings, BarChart3, Users, RefreshCw, AlertCircle, TrendingUp, Package, Lock, Plus, Edit, Trash2, Copy, Download, Upload, Search, Filter, Eye, Check, X, Tag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRateSystem } from "@/hooks/useRateSystem";
import { useRateSystemRealtime } from "@/hooks/useRateSystemRealtime";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { checkEstablishmentFeatureAccess } from "@/lib/featureAccess";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, addDays, eachDayOfInterval, startOfDay, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/reservationUtils";
import { toast } from "sonner";
import { RateCalendarGrid } from "@/components/rate-system/RateCalendarGrid";
import { ARIGrid } from "@/components/rate-system/ARIGrid";
import { RatePlansView } from "@/components/rate-system/RatePlansView";
import { DynamicRulesView } from "@/components/rate-system/DynamicRulesView";
import { RestrictionsView } from "@/components/rate-system/RestrictionsView";
import { RateAnalyticsView } from "@/components/rate-system/RateAnalyticsView";
import { ChannelSyncDialog } from "@/components/rate-system/ChannelSyncDialog";
import { RateSystemSettingsDialog } from "@/components/rate-system/RateSystemSettingsDialog";
import { invokeRecalcRates } from "@/lib/ratesApi";
import { getRequestQueue, useStaggerPhase1 } from "@/lib/rateSystem";
import { PlanTypesView } from "@/components/rate-system/PlanTypesView";
import { PriceDashboardView } from "@/components/rate-system/PriceDashboardView";
import CancellationPolicies from "@/pages/CancellationPolicies";
import { DynamicRatePricesProvider } from "@/contexts/DynamicRatePricesContext";

const PMSRateSystem = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRatePlan, setSelectedRatePlan] = useState<string>('all');
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [viewDays, setViewDays] = useState(30);
  const [channelSyncOpen, setChannelSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [hasDynamicPricingAccess, setHasDynamicPricingAccess] = useState<boolean | null>(null);
  const { selectedEstablishment } = useEstablishment();

  const dateRange = useMemo(() => ({
    start: startDate,
    end: addDays(startDate, viewDays - 1),
  }), [startDate, viewDays]);

  const {
    ratePlans,
    isLoadingRatePlans,
    createRatePlan,
    updateRatePlan,
    deleteRatePlan,
    rateCalendar,
    isLoadingCalendar,
    dynamicRules,
    isLoadingRules,
    createDynamicRule,
    updateDynamicRule,
    deleteDynamicRule,
    restrictions,
    isLoadingRestrictions,
    createRestriction,
    updateRestriction,
    deleteRestriction,
    calculateRatePrice,
    isLoading,
    refetch: refetchRateSystem,
  } = useRateSystem({ dateRange });

  // Sincronização em tempo real: rate_calendar, regras dinâmicas, restrições
  useRateSystemRealtime();

  // Buscar categorias com quartos (seguindo lógica do PMS)
  // Usar o mesmo establishment do contexto (selectedEstablishment) para evitar perda de categorias
  // após salvar preço no grid ARI (invalidação de rate_calendar não deve afetar esta query).
  const establishmentIdForCategories = selectedEstablishment?.id ?? getSelectedEstablishmentId();
  const enableCategoriesLoad = useStaggerPhase1(!!establishmentIdForCategories);
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["rate_system_categories", establishmentIdForCategories],
    enabled: enableCategoriesLoad,
    staleTime: 5 * 60 * 1000, // 5 minutos - evitar refetch desnecessário
    gcTime: 10 * 60 * 1000, // 10 minutos - manter em cache
    refetchOnWindowFocus: false, // Não refazer fetch ao focar na janela
    refetchOnMount: false, // Não refazer fetch ao montar se já tiver dados
    queryFn: async () => {
      const establishmentId = establishmentIdForCategories;
      if (!establishmentId) return [];

      return getRequestQueue().addRequest(async () => {
        // Buscar quartos com suas categorias (paginado)
        const { data: roomsData, error: roomsError } = await supabase
          .from("rooms")
          .select(`*, room_categories (*)`)
          .eq("establishment_id", establishmentId)
          .order("room_number")
          .range(0, 999);

        if (roomsError) {
          console.error("❌ Erro ao buscar quartos:", roomsError);
          throw roomsError;
        }

        // Buscar categorias (paginado)
        const { data: categoriesData, error: categoriesError } = await supabase
          .from("room_categories")
          .select("*")
          .eq("establishment_id", establishmentId)
          .order("name")
          .range(0, 999);
      
        if (categoriesError) {
          console.error("❌ Erro ao buscar categorias:", categoriesError);
          throw categoriesError;
        }

        // Agrupar quartos por categoria
        const categoriesMap = new Map();
        (categoriesData || []).forEach((category: any) => {
          categoriesMap.set(category.id, {
            ...category,
            rooms: []
          });
        });

        (roomsData || []).forEach((room: any) => {
          if (room.is_active === false) return;
          const categoryId = room.category_id;
          if (categoryId && categoriesMap.has(categoryId)) {
            categoriesMap.get(categoryId).rooms.push(room);
          }
        });

        return Array.from(categoriesMap.values())
          .map((category: any) => ({
            ...category,
            rooms: category.rooms.sort((a: any, b: any) =>
              a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
            )
          }));
      });
    },
  });
  
  // Incluir isLoadingCalendar no carregamento inicial para evitar flash de preço base
  // (rateCalendar vazio → exibe base_price; ao carregar → exibe tarifário correto)
  // React Query: isLoading só é true quando não há dados em cache, não durante refetch
  const isInitialLoading = isLoadingRatePlans || categoriesLoading || isLoadingCalendar;

  // Verificar se a empresa tem acesso à funcionalidade de automação de regras dinâmicas
  useEffect(() => {
    const checkAccess = async () => {
      if (!selectedEstablishment?.id) {
        setHasDynamicPricingAccess(false);
        return;
      }

      try {
        const access = await checkEstablishmentFeatureAccess(
          'dynamic_pricing_automation',
          selectedEstablishment.id
        );
        setHasDynamicPricingAccess(access);
      } catch (error) {
        console.error('Erro ao verificar acesso à funcionalidade:', error);
        setHasDynamicPricingAccess(false);
      }
    };

    checkAccess();
  }, [selectedEstablishment?.id]);

  // No mapa de tarifas, exibir "Todos os Planos" por padrão; fallback para um plano se o usuário mudar
  const activePlans = useMemo(() => {
    return ratePlans.filter(p => p.is_active);
  }, [ratePlans]);

  const handleRecalcRates = async () => {
    setRecalcLoading(true);
    try {
      const result = await invokeRecalcRates({
        establishmentId: selectedEstablishment?.id ?? getSelectedEstablishmentId() ?? undefined,
        daysAhead: 14,
      });
      if (result.success) {
        toast.success(
          result.total_updated > 0
            ? `${result.total_updated} preços dinâmicos recalculados e persistidos.`
            : "Recálculo concluído. Nenhuma atualização necessária (verifique se 'Persistir Preços Dinâmicos' está ativo)."
        );
        refetchRateSystem();
      } else {
        toast.error(result.error || "Erro ao recalcular preços dinâmicos");
      }
    } catch (e) {
      toast.error("Erro ao recalcular preços dinâmicos");
    } finally {
      setRecalcLoading(false);
    }
  };

  const defaultPlan = useMemo(() => {
    if (selectedRatePlan) return selectedRatePlan;
    if (activePlans.length > 0) {
      const barPlan = activePlans.find(p => p.code === 'BAR');
      return barPlan?.id || activePlans[0].id;
    }
    return 'all';
  }, [activePlans, selectedRatePlan]);

  // Mostrar loading apenas se estiver carregando categorias ou planos pela primeira vez
  // Não mostrar loading se apenas rate_calendar estiver sendo atualizado
  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Carregando sistema tarifário...</p>
        </div>
      </div>
    );
  }
  
  // Se não houver categorias após o carregamento inicial, mostrar mensagem
  if (!categoriesLoading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 mb-2">Nenhuma categoria encontrada</p>
          <p className="text-sm text-gray-400">
            Crie categorias de quartos no sistema para visualizar o grid ARI
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Sistema Tarifário - PMS</h1>
              <p className="text-sm text-gray-600 mt-1">Gestão completa de tarifas e revenue management</p>
            </div>
            <div className="flex items-center gap-3">
              {hasDynamicPricingAccess && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handleRecalcRates}
                  disabled={recalcLoading}
                >
                  <RefreshCw className={`w-4 h-4 ${recalcLoading ? "animate-spin" : ""}`} />
                  {recalcLoading ? "Recalculando..." : "Recalcular Agora"}
                </Button>
              )}
              <Button variant="outline" className="gap-2" onClick={() => setChannelSyncOpen(true)}>
                <RefreshCw className="w-4 h-4" />
                Sincronizar Canais
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setSettingsOpen(true)}>
                <Settings className="w-4 h-4" />
                Configurações
              </Button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={`grid w-full ${hasDynamicPricingAccess ? 'grid-cols-9' : 'grid-cols-8'}`}>
              <TabsTrigger 
                value="pricing-dashboard" 
                className="gap-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md"
              >
                <DollarSign className="w-4 h-4" />
                Dashboard de Preços
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-2">
                <Calendar className="w-4 h-4" />
                Mapa de Tarifas
              </TabsTrigger>
              <TabsTrigger value="ari-grid" className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Grade ARI
              </TabsTrigger>
              <TabsTrigger value="rateplans" className="gap-2">
                <Package className="w-4 h-4" />
                Planos Tarifários
              </TabsTrigger>
              <TabsTrigger value="plantypes" className="gap-2">
                <Tag className="w-4 h-4" />
                Tipos de Planos
              </TabsTrigger>
              <TabsTrigger value="cancellation-policies" className="gap-2">
                <Settings className="w-4 h-4" />
                Políticas de Cancelamento
              </TabsTrigger>
              {hasDynamicPricingAccess && (
              <TabsTrigger value="dynamic" className="gap-2">
                <TrendingUp className="w-4 h-4" />
                Regras Dinâmicas
              </TabsTrigger>
              )}
              <TabsTrigger value="restrictions" className="gap-2">
                <Lock className="w-4 h-4" />
                Restrições
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Analytics
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Price Dashboard View */}
          <TabsContent value="pricing-dashboard" className="space-y-4">
            <PriceDashboardView />
          </TabsContent>

          {/* Mapa Tarifário e Grade ARI: forceMount para manter estado ao trocar de aba */}
          <DynamicRatePricesProvider>
          {/* Calendar View */}
          <TabsContent 
            value="calendar" 
            className="space-y-4 data-[state=inactive]:hidden" 
            forceMount
          >
            <RateCalendarGrid
              ratePlans={ratePlans}
              categories={categories}
              rateCalendar={rateCalendar}
              selectedCategory={selectedCategory}
              selectedRatePlan={defaultPlan}
              startDate={startDate}
              viewDays={viewDays}
              onViewDaysChange={setViewDays}
              onCategoryChange={setSelectedCategory}
              onPlanChange={setSelectedRatePlan}
              onStartDateChange={setStartDate}
            />
          </TabsContent>

          {/* ARI Grid View */}
          <TabsContent 
            value="ari-grid" 
            className="space-y-4 data-[state=inactive]:hidden" 
            forceMount
          >
            <ARIGrid
              ratePlans={ratePlans}
              categories={categories}
              rateCalendar={rateCalendar}
              selectedCategory={selectedCategory}
              selectedRatePlan={defaultPlan}
              startDate={startDate}
              viewDays={viewDays}
              onViewDaysChange={setViewDays}
              onCategoryChange={setSelectedCategory}
              onPlanChange={setSelectedRatePlan}
              onStartDateChange={setStartDate}
            />
          </TabsContent>
          </DynamicRatePricesProvider>

          {/* Rate Plans View */}
          <TabsContent value="rateplans" className="space-y-4">
            <RatePlansView
              ratePlans={ratePlans}
              isLoading={isLoadingRatePlans}
              onCreate={createRatePlan}
              onUpdate={updateRatePlan}
              onDelete={deleteRatePlan}
            />
          </TabsContent>

          {/* Plan Types View */}
          <TabsContent value="plantypes" className="space-y-4">
            <PlanTypesView />
          </TabsContent>

          {/* Cancellation Policies View */}
          <TabsContent value="cancellation-policies" className="space-y-4">
            <CancellationPolicies />
          </TabsContent>

          {/* Dynamic Rules View */}
          {hasDynamicPricingAccess && (
          <TabsContent value="dynamic" className="space-y-4">
            <DynamicRulesView
              rules={dynamicRules}
              isLoading={isLoadingRules}
              categories={categories}
              ratePlans={ratePlans}
              rateCalendar={rateCalendar}
              onCreate={createDynamicRule}
              onUpdate={updateDynamicRule}
              onDelete={deleteDynamicRule}
            />
          </TabsContent>
          )}

          {/* Restrictions View */}
          <TabsContent value="restrictions" className="space-y-4">
            <RestrictionsView
              restrictions={restrictions}
              isLoading={isLoadingRestrictions}
              categories={categories}
              ratePlans={ratePlans}
              onCreate={createRestriction}
              onUpdate={updateRestriction}
              onDelete={deleteRestriction}
            />
          </TabsContent>

          {/* Analytics View */}
          <TabsContent value="analytics" className="space-y-4">
            <RateAnalyticsView
              categories={categories}
              ratePlans={ratePlans}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <ChannelSyncDialog open={channelSyncOpen} onOpenChange={setChannelSyncOpen} />
      <RateSystemSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default PMSRateSystem;

