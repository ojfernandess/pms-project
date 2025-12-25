import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { BarChart3, TrendingUp, DollarSign, Users, Download, Calendar as CalendarIcon } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useRateMetrics } from "@/hooks/useRateMetrics";
import { useRateRecommendations, applyRecommendationPrice } from "@/hooks/useRateSystem";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { formatCurrency } from "@/lib/reservationUtils";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface RateAnalyticsViewProps {
  categories: any[];
  ratePlans: any[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export const RateAnalyticsView = ({
  categories,
  ratePlans,
}: RateAnalyticsViewProps) => {
  const queryClient = useQueryClient();
  const establishmentId = getSelectedEstablishmentId();
  const [dateRange, setDateRange] = useState({
    start: startOfDay(subDays(new Date(), 30)),
    end: endOfDay(new Date()),
  });
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPlan, setSelectedPlan] = useState<string>("all");
  const [applyingRecommendation, setApplyingRecommendation] = useState<string | null>(null);
  const [showPastRecommendations, setShowPastRecommendations] = useState<boolean>(false);

  const { getMetricsForPeriod } = useRateMetrics();
  
  // Buscar recomendações
  const { data: allRecommendations, isLoading: recommendationsLoading, refetch: refetchRecommendations } = useRateRecommendations(
    dateRange.start,
    dateRange.end,
    selectedCategory !== "all" ? selectedCategory : undefined
  );

  // Filtrar recomendações por data (ocultar passadas por padrão)
  const recommendations = useMemo(() => {
    if (!allRecommendations) return [];
    
    const today = startOfDay(new Date());
    
    if (showPastRecommendations) {
      return allRecommendations;
    }
    
    // Filtrar apenas datas atuais e futuras
    return allRecommendations.filter((rec: any) => {
      if (!rec.date) return false;
      const recDate = startOfDay(new Date(rec.date));
      return recDate >= today;
    });
  }, [allRecommendations, showPastRecommendations]);

  // Função para aplicar recomendação
  const handleApplyRecommendation = async (rec: any) => {
    if (!rec.category_id || !rec.date) {
      toast.error('Informações incompletas na recomendação');
      return;
    }

    // Buscar plano padrão (BAR) ou primeiro plano ativo
    const defaultPlan = ratePlans.find(p => p.code === 'BAR' && p.is_active) || 
                       ratePlans.find(p => p.is_active);
    
    if (!defaultPlan) {
      toast.error('Nenhum plano tarifário ativo encontrado');
      return;
    }

    if (!establishmentId) {
      toast.error('Estabelecimento não selecionado');
      return;
    }

    setApplyingRecommendation(`${rec.category_id}-${rec.date}`);
    
    try {
      await applyRecommendationPrice(
        establishmentId,
        rec.category_id,
        defaultPlan.id,
        new Date(rec.date),
        rec.suggested_price
      );

      toast.success('Preço sugerido aplicado com sucesso!');
      
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      queryClient.invalidateQueries({ queryKey: ["rate_recommendations"] });
      
      // Recarregar recomendações
      refetchRecommendations();
    } catch (error: any) {
      console.error('Erro ao aplicar recomendação:', error);
      toast.error(error.message || 'Erro ao aplicar preço sugerido');
    } finally {
      setApplyingRecommendation(null);
    }
  };

  // Buscar dados de reservas para analytics
  const { data: reservationsData, isLoading: reservationsLoading } = useQuery({
    queryKey: ["analytics_reservations", getSelectedEstablishmentId(), dateRange.start, dateRange.end],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      // Buscar reservas com categoria (relação obrigatória)
      const { data: reservations, error: reservationsError } = await supabase
        .from("reservations")
        .select(`
          *,
          room_categories (*)
        `)
        .eq("establishment_id", establishmentId)
        .gte("checkin_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("checkout_date", format(dateRange.end, "yyyy-MM-dd"))
        .neq("status", "cancelled");

      if (reservationsError) throw reservationsError;

      // Buscar planos tarifários separadamente e mapear
      const reservationsWithPlans = await Promise.all(
        (reservations || []).map(async (reservation: any) => {
          if (reservation.pricing_plan_id) {
            const { data: plan } = await supabase
              .from("pricing_plans")
              .select("*")
              .eq("id", reservation.pricing_plan_id)
              .single();
            
            return {
              ...reservation,
              pricing_plans: plan || null,
            };
          }
          return {
            ...reservation,
            pricing_plans: null,
          };
        })
      );

      return reservationsWithPlans;
    },
  });

  // Calcular métricas agregadas
  const metrics = useMemo(() => {
    if (!reservationsData) return null;

    const filtered = reservationsData.filter((r: any) => {
      if (selectedCategory !== "all" && r.category_id !== selectedCategory) return false;
      if (selectedPlan !== "all" && r.pricing_plan_id !== selectedPlan) return false;
      return true;
    });

    const totalRevenue = filtered.reduce((sum: number, r: any) => sum + (Number(r.paid_amount || r.total_amount) || 0), 0);
    const totalReservations = filtered.length;
    const avgADR = totalReservations > 0 ? totalRevenue / totalReservations : 0;

    // Por categoria
    const revenueByCategory = categories.map(cat => {
      const catReservations = filtered.filter((r: any) => r.category_id === cat.id);
      const revenue = catReservations.reduce((sum: number, r: any) => sum + (Number(r.paid_amount || r.total_amount) || 0), 0);
      return {
        name: cat.name,
        revenue,
        reservations: catReservations.length,
        adr: catReservations.length > 0 ? revenue / catReservations.length : 0,
      };
    }).filter(item => item.revenue > 0);

    // Por plano tarifário
    const revenueByPlan = ratePlans.map(plan => {
      const planReservations = filtered.filter((r: any) => r.pricing_plan_id === plan.id);
      const revenue = planReservations.reduce((sum: number, r: any) => sum + (Number(r.paid_amount || r.total_amount) || 0), 0);
      return {
        name: plan.name,
        revenue,
        reservations: planReservations.length,
        adr: planReservations.length > 0 ? revenue / planReservations.length : 0,
      };
    }).filter(item => item.revenue > 0);

    // Por dia (últimos 30 dias)
    const revenueByDay: Record<string, { revenue: number; reservations: number }> = {};
    filtered.forEach((r: any) => {
      const checkin = new Date(r.checkin_date);
      const checkout = new Date(r.checkout_date);
      const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
      const dailyRevenue = (Number(r.paid_amount || r.total_amount) || 0) / nights;

      for (let i = 0; i < nights; i++) {
        const date = new Date(checkin);
        date.setDate(checkin.getDate() + i);
        const dateStr = format(date, "yyyy-MM-dd");
        
        if (!revenueByDay[dateStr]) {
          revenueByDay[dateStr] = { revenue: 0, reservations: 0 };
        }
        revenueByDay[dateStr].revenue += dailyRevenue;
        if (i === 0) revenueByDay[dateStr].reservations += 1;
      }
    });

    const dailyData = Object.entries(revenueByDay)
      .map(([date, data]) => ({
        date: format(new Date(date), "dd/MM", { locale: ptBR }),
        revenue: data.revenue,
        reservations: data.reservations,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      totalRevenue,
      totalReservations,
      avgADR,
      revenueByCategory,
      revenueByPlan,
      dailyData,
    };
  }, [reservationsData, categories, ratePlans, selectedCategory, selectedPlan]);

  if (reservationsLoading) {
    return <div className="text-center p-8">Carregando analytics...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Analytics e Relatórios</h2>
          <p className="text-sm text-gray-500 mt-1">
            Análise de performance, receita e otimização de tarifas
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Exportar Relatório
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-4 gap-4">
          <div>
            <Label>Período</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateRange.start, "dd/MM/yyyy", { locale: ptBR })} - {format(dateRange.end, "dd/MM/yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.start, to: dateRange.end }}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDateRange({ start: startOfDay(range.from), end: endOfDay(range.to) });
                    }
                  }}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Plano Tarifário</Label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ratePlans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Métricas Resumidas */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Receita Total</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(metrics.totalRevenue)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Reservas</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {metrics.totalReservations}
                </p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">ADR Médio</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(metrics.avgADR)}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-600" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">RevPAR</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(metrics.avgADR * 0.75)}
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-orange-600" />
            </div>
          </Card>
        </div>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
          <TabsTrigger value="revenue">Receita</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        <TabsContent value="recommendations" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-gray-900">Recomendações de Preços</h3>
                <Badge variant={recommendations && recommendations.length > 0 ? "default" : "secondary"}>
                  {recommendations?.length || 0} recomendações
                </Badge>
                {allRecommendations && allRecommendations.length > recommendations.length && (
                  <Badge variant="outline" className="text-xs">
                    {allRecommendations.length - recommendations.length} ocultas (datas passadas)
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="show-past" className="text-sm text-gray-600 cursor-pointer">
                  Mostrar datas passadas
                </Label>
                <Switch
                  id="show-past"
                  checked={showPastRecommendations}
                  onCheckedChange={setShowPastRecommendations}
                />
              </div>
            </div>
            
            {recommendationsLoading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-gray-500">Carregando recomendações...</p>
              </div>
            ) : recommendations && recommendations.length > 0 ? (
              <div className="space-y-4">
                {recommendations.map((rec: any, index: number) => (
                  <Card key={index} className="p-4 border-l-4 border-l-blue-500">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={rec.priority === 'high' ? 'destructive' : 'default'}>
                            {rec.priority === 'high' ? 'Alta Prioridade' : 'Média Prioridade'}
                          </Badge>
                          {rec.category_name && (
                            <span className="text-sm text-gray-600">Categoria: {rec.category_name}</span>
                          )}
                          {rec.date && (
                            <span className="text-sm text-gray-600">
                              Data: {format(new Date(rec.date), 'dd/MM/yyyy', { locale: ptBR })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mb-3">{rec.message}</p>
                        <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                          <div>
                            <span className="text-gray-500">Preço Atual:</span>
                            <p className="font-semibold text-gray-900">{formatCurrency(rec.current_price)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Preço Sugerido:</span>
                            <p className="font-semibold text-green-600">{formatCurrency(rec.suggested_price)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Impacto na Receita:</span>
                            <p className={`font-semibold ${rec.estimated_revenue_impact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(rec.estimated_revenue_impact)}
                            </p>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleApplyRecommendation(rec)}
                            disabled={applyingRecommendation === `${rec.category_id}-${rec.date}`}
                            className="gap-2"
                          >
                            {applyingRecommendation === `${rec.category_id}-${rec.date}` ? (
                              <>
                                <Download className="w-4 h-4 animate-spin" />
                                Aplicando...
                              </>
                            ) : (
                              <>
                                <DollarSign className="w-4 h-4" />
                                Aplicar Preço Sugerido
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-2">Nenhuma recomendação disponível no período selecionado.</p>
                <p className="text-sm text-gray-400">
                  As recomendações são geradas automaticamente com base na ocupação e nas configurações do sistema.
                </p>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Receita por Categoria */}
            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Receita por Categoria</h3>
              {metrics && metrics.revenueByCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics.revenueByCategory}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="revenue"
                    >
                      {metrics.revenueByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-300 flex items-center justify-center text-gray-500">
                  Sem dados disponíveis
                </div>
              )}
            </Card>

            {/* Performance por Plano */}
            <Card className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Performance por Plano Tarifário</h3>
              {metrics && metrics.revenueByPlan.length > 0 ? (
                <div className="space-y-4">
                  {metrics.revenueByPlan.map((plan, idx) => (
                    <div key={idx}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{plan.name}</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(plan.revenue)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{
                            width: `${(plan.revenue / (metrics.revenueByPlan[0]?.revenue || 1)) * 100}%`,
                          }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>{plan.reservations} reservas</span>
                        <span>ADR: {formatCurrency(plan.adr)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-300 flex items-center justify-center text-gray-500">
                  Sem dados disponíveis
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Receita Diária</h3>
            {metrics && metrics.dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={metrics.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#3B82F6" name="Receita" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-400 flex items-center justify-center text-gray-500">
                Sem dados disponíveis
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">ADR e Reservas por Dia</h3>
            {metrics && metrics.dailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={metrics.dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3B82F6"
                    name="Receita"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="reservations"
                    stroke="#10B981"
                    name="Reservas"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-400 flex items-center justify-center text-gray-500">
                Sem dados disponíveis
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="forecast" className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Forecast vs Actual</h3>
            <div className="h-400 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                <div>Gráfico de comparação Forecast vs Actual seria renderizado aqui</div>
                <p className="text-sm text-gray-400 mt-2">
                  Esta funcionalidade requer dados históricos e modelos preditivos
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
