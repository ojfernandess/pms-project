import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, DollarSign, Settings, BarChart3, Users, RefreshCw, AlertCircle, TrendingUp, Package, Lock, Plus, Edit, Trash2, Copy, Download, Upload, Search, Filter, Eye, Check, X, Tag } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRateSystem } from "@/hooks/useRateSystem";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { format, addDays, eachDayOfInterval, startOfDay, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency } from "@/lib/reservationUtils";
import { toast } from "sonner";
import { RateCalendarGrid } from "@/components/rate-system/RateCalendarGrid";
import { RatePlansView } from "@/components/rate-system/RatePlansView";
import { DynamicRulesView } from "@/components/rate-system/DynamicRulesView";
import { RestrictionsView } from "@/components/rate-system/RestrictionsView";
import { RateAnalyticsView } from "@/components/rate-system/RateAnalyticsView";
import { ChannelSyncDialog } from "@/components/rate-system/ChannelSyncDialog";
import { RateSystemSettingsDialog } from "@/components/rate-system/RateSystemSettingsDialog";
import { PlanTypesView } from "@/components/rate-system/PlanTypesView";

const PMSRateSystem = () => {
  const [activeTab, setActiveTab] = useState('calendar');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRatePlan, setSelectedRatePlan] = useState<string>('');
  const [startDate, setStartDate] = useState(startOfDay(new Date()));
  const [channelSyncOpen, setChannelSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  } = useRateSystem();

  // Buscar categorias com quartos (seguindo lógica do PMS)
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["rate_system_categories", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      // Buscar quartos com suas categorias
      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select(`
          *,
          room_categories (*)
        `)
        .eq("establishment_id", establishmentId)
        .order("room_number");

      if (roomsError) {
        console.error("❌ Erro ao buscar quartos:", roomsError);
        throw roomsError;
      }

      // Buscar categorias
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("name");
      
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
        // Filtrar quartos inativos se a coluna existir
        if (room.is_active === false) {
          return;
        }
        
        const categoryId = room.category_id;
        if (categoryId && categoriesMap.has(categoryId)) {
          categoriesMap.get(categoryId).rooms.push(room);
        }
      });

      // Converter para array e ordenar quartos
      const categoriesWithRooms = Array.from(categoriesMap.values())
        .map((category: any) => ({
          ...category,
          rooms: category.rooms.sort((a: any, b: any) => 
            a.room_number.localeCompare(b.room_number, undefined, { numeric: true })
          )
        }));

      return categoriesWithRooms;
    },
  });

  // Selecionar primeiro plano ativo por padrão
  const activePlans = useMemo(() => {
    return ratePlans.filter(p => p.is_active);
  }, [ratePlans]);

  const defaultPlan = useMemo(() => {
    if (selectedRatePlan) return selectedRatePlan;
    if (activePlans.length > 0) {
      const barPlan = activePlans.find(p => p.code === 'BAR');
      return barPlan?.id || activePlans[0].id;
    }
    return '';
  }, [activePlans, selectedRatePlan]);

  if (isLoading || categoriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Carregando sistema tarifário...</p>
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
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="calendar" className="gap-2">
                <Calendar className="w-4 h-4" />
                Mapa de Tarifas
              </TabsTrigger>
              <TabsTrigger value="rateplans" className="gap-2">
                <Package className="w-4 h-4" />
                Planos Tarifários
              </TabsTrigger>
              <TabsTrigger value="plantypes" className="gap-2">
                <Tag className="w-4 h-4" />
                Tipos de Planos
              </TabsTrigger>
              <TabsTrigger value="dynamic" className="gap-2">
                <TrendingUp className="w-4 h-4" />
                Regras Dinâmicas
              </TabsTrigger>
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
          {/* Calendar View */}
          <TabsContent value="calendar" className="space-y-4">
            <RateCalendarGrid
              ratePlans={ratePlans}
              categories={categories}
              selectedCategory={selectedCategory}
              selectedRatePlan={defaultPlan}
              startDate={startDate}
              onCategoryChange={setSelectedCategory}
              onPlanChange={setSelectedRatePlan}
              onStartDateChange={setStartDate}
            />
          </TabsContent>

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

          {/* Dynamic Rules View */}
          <TabsContent value="dynamic" className="space-y-4">
            <DynamicRulesView
              rules={dynamicRules}
              isLoading={isLoadingRules}
              categories={categories}
              ratePlans={ratePlans}
              onCreate={createDynamicRule}
              onUpdate={updateDynamicRule}
              onDelete={deleteDynamicRule}
            />
          </TabsContent>

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

