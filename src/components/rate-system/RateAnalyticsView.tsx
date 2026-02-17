import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { BarChart3, TrendingUp, DollarSign, Users, Download, Calendar as CalendarIcon, FileSpreadsheet, FileText, ChevronDown, CheckCircle2, Loader2 } from "lucide-react";
import { format, subDays, subYears, startOfDay, endOfDay, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useRateMetrics } from "@/hooks/useRateMetrics";
import { useRateRecommendations, applyRecommendationPrice, useRateSystem } from "@/hooks/useRateSystem";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { formatCurrency } from "@/lib/reservationUtils";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { logActivity } from "@/lib/activityLogger";
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
  ComposedChart,
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
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    return {
      start: startOfDay(startOfMonth(now)),
      end: endOfDay(endOfMonth(now)),
    };
  });
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedPlan, setSelectedPlan] = useState<string>("all");
  const [applyingRecommendation, setApplyingRecommendation] = useState<string | null>(null);
  const [showPastRecommendations, setShowPastRecommendations] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState(false);
  const [updatedPrices, setUpdatedPrices] = useState<Record<string, number>>({});
  const [selectedPlansForRecommendations, setSelectedPlansForRecommendations] = useState<Record<string, string>>({});
  const [planPrices, setPlanPrices] = useState<Record<string, number>>({});
  const [calculatedSuggestedPrices, setCalculatedSuggestedPrices] = useState<Record<string, number>>({});

  const { getMetricsForPeriod } = useRateMetrics();
  const { refetch: refetchRateSystem } = useRateSystem();
  
  // Verificar se a feature flag de recomendações está habilitada
  const { data: siteSettings } = useQuery({
    queryKey: ["site_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('site_settings')
        .select('features_enabled')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  const isRateRecommendationsEnabled = useMemo(() => {
    if (!establishmentId || !siteSettings?.features_enabled) return false;
    return isFeatureEnabledForEstablishment(
      siteSettings.features_enabled?.rate_recommendations,
      establishmentId
    );
  }, [establishmentId, siteSettings]);
  
  // Buscar recomendações (apenas se a feature flag estiver habilitada)
  const { data: allRecommendations, isLoading: recommendationsLoading, refetch: refetchRecommendations } = useRateRecommendations(
    dateRange.start,
    dateRange.end,
    selectedCategory !== "all" ? selectedCategory : undefined,
    isRateRecommendationsEnabled // Passar o estado da feature flag
  );

  // Filtrar recomendações por data (ocultar passadas por padrão) e aplicar preços atualizados em tempo real
  const recommendations = useMemo(() => {
    if (!allRecommendations) return [];
    
    const today = startOfDay(new Date());
    
    let filtered = showPastRecommendations 
      ? allRecommendations 
      : allRecommendations.filter((rec: any) => {
          if (!rec.date) return false;
          const recDate = startOfDay(new Date(rec.date));
          return recDate >= today;
        });
    
    // Aplicar preços atualizados em tempo real
    return filtered.map((rec: any) => {
      const recommendationKey = `${rec.category_id}-${rec.date}`;
      if (updatedPrices[recommendationKey] !== undefined) {
        return {
          ...rec,
          current_price: updatedPrices[recommendationKey]
        };
      }
      return rec;
    });
  }, [allRecommendations, showPastRecommendations, updatedPrices]);

  // Função para aplicar recomendação
  const handleApplyRecommendation = async (rec: any) => {
    if (!rec.category_id || !rec.date) {
      toast.error('Informações incompletas na recomendação');
      return;
    }

    const recommendationKey = `${rec.category_id}-${rec.date}`;
    
    // Buscar plano selecionado ou usar o plano padrão da recomendação
    let selectedPlanId = selectedPlansForRecommendations[recommendationKey];
    
    if (!selectedPlanId) {
      // Se não há plano selecionado, usar o plano da recomendação ou buscar padrão
      if (rec.pricing_plan_id) {
        selectedPlanId = rec.pricing_plan_id;
      } else {
        // Buscar plano padrão (BAR) ou primeiro plano ativo
        const defaultPlan = ratePlans.find(p => p.code === 'BAR' && p.is_active) || 
                           ratePlans.find(p => p.is_active);
        if (!defaultPlan) {
          toast.error('Nenhum plano tarifário ativo encontrado. Por favor, selecione um plano.');
          return;
        }
        selectedPlanId = defaultPlan.id;
      }
    }

    const selectedPlan = ratePlans.find(p => p.id === selectedPlanId);
    
    if (!selectedPlan) {
      toast.error('Plano tarifário selecionado não encontrado');
      return;
    }

    if (!establishmentId) {
      toast.error('Estabelecimento não selecionado');
      return;
    }

    setApplyingRecommendation(recommendationKey);
    
    // Determinar qual preço sugerido usar
    // Se há um plano selecionado diferente do original e há preço sugerido calculado, usar ele
    // Caso contrário, usar o preço sugerido da recomendação original
    let priceToApply = rec.suggested_price;
    if (selectedPlanId && selectedPlanId !== rec.pricing_plan_id && calculatedSuggestedPrices[recommendationKey]) {
      priceToApply = calculatedSuggestedPrices[recommendationKey];
    } else if (selectedPlanId === rec.pricing_plan_id && calculatedSuggestedPrices[recommendationKey]) {
      // Se o plano selecionado é o mesmo da recomendação mas há preço calculado, usar ele (pode ter sido recalculado)
      priceToApply = calculatedSuggestedPrices[recommendationKey];
    }
    
    // Buscar informações da categoria para a mensagem e log
    const category = categories.find((c: any) => c.id === rec.category_id);
    const categoryName = category?.name || 'Categoria';
    const dateFormatted = format(new Date(rec.date), "dd/MM/yyyy", { locale: ptBR });
    const dateStr = format(new Date(rec.date), 'yyyy-MM-dd');
    const priceFormatted = formatCurrency(priceToApply);
    const planName = selectedPlan.name || 'Plano';

    // Buscar preço anterior ANTES de aplicar o novo preço
    const { data: previousRate } = await supabase
      .from('rate_calendar')
      .select('base_price')
      .eq('establishment_id', establishmentId)
      .eq('category_id', rec.category_id)
      .eq('pricing_plan_id', selectedPlan.id)
      .eq('date', dateStr)
      .maybeSingle();
    
    const previousPrice = previousRate?.base_price || (planPrices[recommendationKey] || rec.current_price || 0);
    
    try {
      const result = await applyRecommendationPrice(
        establishmentId,
        rec.category_id,
        selectedPlan.id,
        new Date(rec.date),
        priceToApply
      );

      // Registrar log de atividade
      await logActivity({
        actionType: "price_recommendation_applied",
        entityType: "rate_calendar",
        entityCode: `${categoryName} - ${planName} - ${dateFormatted}`,
        description: `Preço sugerido aplicado: ${categoryName} - ${planName} - ${dateFormatted}. Preço anterior: ${formatCurrency(previousPrice)}, Preço aplicado: ${priceFormatted}`,
        oldValues: {
          price: previousPrice,
          category_id: rec.category_id,
          category_name: categoryName,
          pricing_plan_id: selectedPlan.id,
          pricing_plan_name: planName,
          date: dateStr,
        },
        newValues: {
          price: priceToApply,
          category_id: rec.category_id,
          category_name: categoryName,
          pricing_plan_id: selectedPlan.id,
          pricing_plan_name: planName,
          date: dateStr,
        },
        metadata: {
          recommendation_type: rec.priority,
          recommendation_message: rec.message,
          suggested_price: rec.suggested_price,
        },
      });

      toast.success(
        `Preço atualizado com sucesso! ${categoryName} - ${planName} - ${dateFormatted}: ${priceFormatted}`,
        { duration: 5000 }
      );
      
      // Aguardar um pouco mais para garantir que o banco foi atualizado e propagado
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Invalidar todas as queries relacionadas ao rate_calendar
      await queryClient.invalidateQueries({ 
        queryKey: ["rate_calendar"],
        exact: false // Invalida todas as queries que começam com ["rate_calendar"]
      });
      
      // Invalidar recomendações primeiro
      await queryClient.invalidateQueries({ 
        queryKey: ["rate_recommendations"],
        exact: false
      });
      
      await queryClient.invalidateQueries({ 
        queryKey: ["rate_calendar_modal"],
        exact: false
      });
      
      // Invalidar logs de atividades para atualizar a interface
      await queryClient.invalidateQueries({ 
        queryKey: ["activity_logs"],
        exact: false
      });
      
      // Refetch completo do sistema tarifário
      await refetchRateSystem();
      
      // Refetch forçado de todas as queries de rate_calendar
      await queryClient.refetchQueries({ 
        queryKey: ["rate_calendar"],
        exact: false
      });
      
      // Atualizar o preço atual em tempo real imediatamente após aplicar
      const recommendationKey = `${rec.category_id}-${rec.date}`;
      setUpdatedPrices(prev => ({
        ...prev,
        [recommendationKey]: priceToApply
      }));
      
      // Atualizar também o preço do plano selecionado
      setPlanPrices(prev => ({
        ...prev,
        [recommendationKey]: priceToApply
      }));
      
      // Limpar o preço sugerido calculado já que foi aplicado
      setCalculatedSuggestedPrices(prev => {
        const updated = { ...prev };
        delete updated[recommendationKey];
        return updated;
      });

      // Aguardar um pouco antes de recarregar recomendações para garantir que o banco foi atualizado
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Recarregar recomendações para atualizar o "Preço Atual" (em background)
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

  // Período do ano anterior (mesmo intervalo de dias) para Forecast vs Actual
  const dateRangeLastYear = useMemo(() => ({
    start: subYears(dateRange.start, 1),
    end: subYears(dateRange.end, 1),
  }), [dateRange.start, dateRange.end]);

  const { data: reservationsDataLastYear } = useQuery({
    queryKey: ["analytics_reservations_last_year", getSelectedEstablishmentId(), dateRangeLastYear.start, dateRangeLastYear.end],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data: reservations, error } = await supabase
        .from("reservations")
        .select("id, checkin_date, checkout_date, paid_amount, total_amount, status, category_id, pricing_plan_id")
        .eq("establishment_id", establishmentId)
        .gte("checkin_date", format(dateRangeLastYear.start, "yyyy-MM-dd"))
        .lte("checkout_date", format(dateRangeLastYear.end, "yyyy-MM-dd"))
        .neq("status", "cancelled");

      if (error) throw error;
      return reservations || [];
    },
    enabled: !!establishmentId,
  });

  // Preparar dados para exportação
  const prepareExportData = useMemo(() => {
    if (!reservationsData) return null;

    const filtered = reservationsData.filter((r: any) => {
      if (selectedCategory !== "all" && r.category_id !== selectedCategory) return false;
      if (selectedPlan !== "all" && r.pricing_plan_id !== selectedPlan) return false;
      return true;
    });

    // Dados principais para exportação
    const exportData = filtered.map((r: any) => ({
      "Código": r.reservation_code || "-",
      "Categoria": r.room_categories?.name || "-",
      "Plano Tarifário": r.pricing_plans?.name || "-",
      "Check-in": r.checkin_date ? format(new Date(r.checkin_date), "dd/MM/yyyy", { locale: ptBR }) : "-",
      "Check-out": r.checkout_date ? format(new Date(r.checkout_date), "dd/MM/yyyy", { locale: ptBR }) : "-",
      "Hóspede": r.guest_name || "-",
      "Status": r.status || "-",
      "Valor Total": formatCurrency(Number(r.total_amount || 0)),
      "Valor Pago": formatCurrency(Number(r.paid_amount || 0)),
      "Valor Pendente": formatCurrency(Number(r.total_amount || 0) - Number(r.paid_amount || 0)),
      "Noites": Math.ceil(
        (new Date(r.checkout_date).getTime() - new Date(r.checkin_date).getTime()) / (1000 * 60 * 60 * 24)
      ),
      "ADR": formatCurrency(
        Math.ceil(
          (new Date(r.checkout_date).getTime() - new Date(r.checkin_date).getTime()) / (1000 * 60 * 60 * 24)
        ) > 0
          ? Number(r.total_amount || 0) /
              Math.ceil(
                (new Date(r.checkout_date).getTime() - new Date(r.checkin_date).getTime()) / (1000 * 60 * 60 * 24)
              )
          : 0
      ),
    }));

    return exportData;
  }, [reservationsData, selectedCategory, selectedPlan, categories, ratePlans]);

  // Função para exportar para XLSX
  const handleExportXLSX = async () => {
    if (!prepareExportData || !metrics) {
      toast.error("Nenhum dado disponível para exportação");
      return;
    }

    setIsExporting(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();

      // Aba 1: Resumo
      const summaryData = [
        { "Métrica": "Receita Total", "Valor": formatCurrency(metrics.totalRevenue) },
        { "Métrica": "Total de Reservas", "Valor": metrics.totalReservations.toString() },
        { "Métrica": "ADR Médio", "Valor": formatCurrency(metrics.avgADR) },
        { "Métrica": "RevPAR", "Valor": formatCurrency(metrics.avgADR * 0.75) },
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");

      // Aba 2: Receita por Categoria
      const categoryData = metrics.revenueByCategory.map((cat: any) => ({
        "Categoria": cat.name,
        "Receita": formatCurrency(cat.revenue),
        "Reservas": cat.reservations.toString(),
        "ADR": formatCurrency(cat.adr),
      }));
      const categorySheet = XLSX.utils.json_to_sheet(categoryData);
      XLSX.utils.book_append_sheet(workbook, categorySheet, "Por Categoria");

      // Aba 3: Receita por Plano
      const planData = metrics.revenueByPlan.map((plan: any) => ({
        "Plano Tarifário": plan.name,
        "Receita": formatCurrency(plan.revenue),
        "Reservas": plan.reservations.toString(),
        "ADR": formatCurrency(plan.adr),
      }));
      const planSheet = XLSX.utils.json_to_sheet(planData);
      XLSX.utils.book_append_sheet(workbook, planSheet, "Por Plano");

      // Aba 4: Detalhes das Reservas
      const reservationsSheet = XLSX.utils.json_to_sheet(prepareExportData);
      XLSX.utils.book_append_sheet(workbook, reservationsSheet, "Reservas");

      const filename = `Relatorio_Analytics_${format(dateRange.start, "yyyy-MM-dd")}_${format(dateRange.end, "yyyy-MM-dd")}`;
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      toast.success("Relatório exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar:", error);
      toast.error("Erro ao exportar relatório");
    } finally {
      setIsExporting(false);
    }
  };

  // Função para exportar para PDF
  const handleExportPDF = async () => {
    if (!prepareExportData || !metrics) {
      toast.error("Nenhum dado disponível para exportação");
      return;
    }

    setIsExporting(true);
    try {
      const jsPDF = (await import("jspdf")).default;
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      let currentY = margin;

      // Título
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Relatório de Analytics e Relatórios", margin, currentY);
      currentY += 10;

      // Informações do período
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Período: ${format(dateRange.start, "dd/MM/yyyy", { locale: ptBR })} até ${format(dateRange.end, "dd/MM/yyyy", { locale: ptBR })}`,
        margin,
        currentY
      );
      currentY += 6;
      if (selectedCategory !== "all") {
        const categoryName = categories.find((c) => c.id === selectedCategory)?.name || selectedCategory;
        doc.text(`Categoria: ${categoryName}`, margin, currentY);
        currentY += 6;
      }
      if (selectedPlan !== "all") {
        const planName = ratePlans.find((p) => p.id === selectedPlan)?.name || selectedPlan;
        doc.text(`Plano Tarifário: ${planName}`, margin, currentY);
        currentY += 6;
      }
      currentY += 5;

      // Resumo
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Resumo", margin, currentY);
      currentY += 8;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const summaryData = [
        { "Métrica": "Receita Total", "Valor": formatCurrency(metrics.totalRevenue) },
        { "Métrica": "Total de Reservas", "Valor": metrics.totalReservations.toString() },
        { "Métrica": "ADR Médio", "Valor": formatCurrency(metrics.avgADR) },
        { "Métrica": "RevPAR", "Valor": formatCurrency(metrics.avgADR * 0.75) },
      ];
      summaryData.forEach((item: any) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${item.Métrica}:`, margin, currentY);
        doc.setFont("helvetica", "normal");
        doc.text(item.Valor, margin + 60, currentY);
        currentY += 7;
      });
      currentY += 5;

      // Receita por Categoria
      if (metrics.revenueByCategory.length > 0) {
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Receita por Categoria", margin, currentY);
        currentY += 8;

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Categoria", margin, currentY);
        doc.text("Receita", margin + 60, currentY);
        doc.text("Reservas", margin + 100, currentY);
        doc.text("ADR", margin + 130, currentY);
        currentY += 6;
        doc.line(margin, currentY - 2, pageWidth - margin, currentY - 2);
        currentY += 3;

        doc.setFont("helvetica", "normal");
        metrics.revenueByCategory.forEach((item: any) => {
          if (currentY > 270) {
            doc.addPage();
            currentY = margin + 10;
          }
          doc.text(item.name, margin, currentY);
          doc.text(formatCurrency(item.revenue), margin + 60, currentY);
          doc.text(item.reservations.toString(), margin + 100, currentY);
          doc.text(formatCurrency(item.adr), margin + 130, currentY);
          currentY += 7;
        });
        currentY += 5;
      }

      // Receita por Plano
      if (metrics.revenueByPlan.length > 0) {
        if (currentY > 250) {
          doc.addPage();
          currentY = margin + 10;
        }

        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Receita por Plano Tarifário", margin, currentY);
        currentY += 8;

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Plano", margin, currentY);
        doc.text("Receita", margin + 60, currentY);
        doc.text("Reservas", margin + 100, currentY);
        doc.text("ADR", margin + 130, currentY);
        currentY += 6;
        doc.line(margin, currentY - 2, pageWidth - margin, currentY - 2);
        currentY += 3;

        doc.setFont("helvetica", "normal");
        metrics.revenueByPlan.forEach((item: any) => {
          if (currentY > 270) {
            doc.addPage();
            currentY = margin + 10;
          }
          doc.text(item.name, margin, currentY);
          doc.text(formatCurrency(item.revenue), margin + 60, currentY);
          doc.text(item.reservations.toString(), margin + 100, currentY);
          doc.text(formatCurrency(item.adr), margin + 130, currentY);
          currentY += 7;
        });
      }

      // Rodapé
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "italic");
        doc.text(
          `Página ${i} de ${totalPages}`,
          pageWidth - margin - 30,
          doc.internal.pageSize.getHeight() - 10
        );
        doc.text(
          `Gerado em ${new Date().toLocaleString("pt-BR")}`,
          margin,
          doc.internal.pageSize.getHeight() - 10
        );
      }

      const filename = `Relatorio_Analytics_${format(dateRange.start, "yyyy-MM-dd")}_${format(dateRange.end, "yyyy-MM-dd")}`;
      doc.save(`${filename}.pdf`);
      toast.success("Relatório PDF exportado com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast.error("Erro ao exportar relatório PDF");
    } finally {
      setIsExporting(false);
    }
  };

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

  // Helper: agregar receita e reservas por dia a partir de uma lista de reservas
  const buildRevenueByDay = (reservations: any[], filter: { category?: string; plan?: string }) => {
    const filtered = (reservations || []).filter((r: any) => {
      if (filter.category && filter.category !== "all" && r.category_id !== filter.category) return false;
      if (filter.plan && filter.plan !== "all" && r.pricing_plan_id !== filter.plan) return false;
      return true;
    });
    const byDay: Record<string, { revenue: number; reservations: number }> = {};
    filtered.forEach((r: any) => {
      const checkin = new Date(r.checkin_date);
      const checkout = new Date(r.checkout_date);
      const nights = Math.max(1, Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24)));
      const dailyRevenue = (Number(r.paid_amount || r.total_amount) || 0) / nights;
      for (let i = 0; i < nights; i++) {
        const d = new Date(checkin);
        d.setDate(checkin.getDate() + i);
        const dateStr = format(d, "yyyy-MM-dd");
        if (!byDay[dateStr]) byDay[dateStr] = { revenue: 0, reservations: 0 };
        byDay[dateStr].revenue += dailyRevenue;
        if (i === 0) byDay[dateStr].reservations += 1;
      }
    });
    return byDay;
  };

  // Dados para Forecast vs Actual: Realizado (período atual) vs Ano anterior (mesmo período)
  const forecastVsActualData = useMemo(() => {
    const filter = { category: selectedCategory, plan: selectedPlan };
    const thisYearByDay = buildRevenueByDay(reservationsData || [], filter);
    const lastYearByDay = buildRevenueByDay(reservationsDataLastYear || [], filter);

    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    return days.map((day) => {
      const fullDate = format(day, "yyyy-MM-dd");
      const lastYearDate = format(subYears(day, 1), "yyyy-MM-dd");
      const actual = thisYearByDay[fullDate] || { revenue: 0, reservations: 0 };
      const forecast = lastYearByDay[lastYearDate] || { revenue: 0, reservations: 0 };
      return {
        dateLabel: format(day, "dd/MM", { locale: ptBR }),
        fullDate,
        actualRevenue: actual.revenue,
        actualReservations: actual.reservations,
        forecastRevenue: forecast.revenue,
        forecastReservations: forecast.reservations,
      };
    });
  }, [reservationsData, reservationsDataLastYear, dateRange.start, dateRange.end, selectedCategory, selectedPlan]);

  const forecastVsActualSummary = useMemo(() => {
    const totalActual = forecastVsActualData.reduce((s, row) => s + row.actualRevenue, 0);
    const totalForecast = forecastVsActualData.reduce((s, row) => s + row.forecastRevenue, 0);
    const variation = totalForecast > 0 ? ((totalActual - totalForecast) / totalForecast) * 100 : 0;
    return { totalActual, totalForecast, variation };
  }, [forecastVsActualData]);

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={isExporting || !metrics}>
                {isExporting ? (
                  <>
                    <Download className="w-4 h-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Exportar Relatório
                    <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportXLSX} disabled={isExporting || !metrics}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Exportar para Excel (XLSX)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPDF} disabled={isExporting || !metrics}>
                <FileText className="w-4 h-4 mr-2" />
                Exportar para PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          {isRateRecommendationsEnabled && (
            <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
          )}
          <TabsTrigger value="revenue">Receita</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        {isRateRecommendationsEnabled && (
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
                {recommendations.map((rec: any, index: number) => {
                  const recommendationKey = `${rec.category_id}-${rec.date}`;
                  const isApplying = applyingRecommendation === recommendationKey;
                  return (
                  <Card 
                    key={index} 
                    className={`p-4 border-l-4 border-l-blue-500 transition-all duration-300 ${
                      isApplying ? 'ring-2 ring-blue-400 ring-opacity-50 bg-blue-50/30' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={rec.priority === 'high' ? 'destructive' : 'default'}>
                            {rec.priority === 'high' ? 'Alta Prioridade' : 'Média Prioridade'}
                          </Badge>
                          {rec.category_name && (
                            <span className="text-sm text-gray-600">Categoria: {rec.category_name}</span>
                          )}
                          {(() => {
                            const recommendationKey = `${rec.category_id}-${rec.date}`;
                            const selectedPlanId = selectedPlansForRecommendations[recommendationKey] || rec.pricing_plan_id;
                            const selectedPlan = selectedPlanId ? ratePlans.find(p => p.id === selectedPlanId) : null;
                            const planName = selectedPlan?.name || rec.pricing_plan_name;
                            return planName && (
                              <span className="text-sm text-gray-600">Plano: {planName}</span>
                            );
                          })()}
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
                            <p className="font-semibold text-gray-900 transition-all duration-300">
                              {(() => {
                                const recommendationKey = `${rec.category_id}-${rec.date}`;
                                const selectedPlanId = selectedPlansForRecommendations[recommendationKey] || rec.pricing_plan_id;
                                
                                // Se o plano selecionado é diferente do plano original da recomendação
                                if (selectedPlanId && selectedPlanId !== rec.pricing_plan_id) {
                                  // Se há preço do plano selecionado, usar ele (prioridade)
                                  if (planPrices[recommendationKey]) {
                                    return formatCurrency(planPrices[recommendationKey]);
                                  }
                                  // Caso contrário, usar o preço atual da recomendação (será atualizado quando buscar)
                                  return formatCurrency(rec.current_price);
                                }
                                
                                // Se o plano é o mesmo da recomendação e há preço atualizado (após aplicar), usar ele
                                if (updatedPrices[recommendationKey] !== undefined) {
                                  return (
                                    <span className="flex items-center gap-1">
                                      {formatCurrency(updatedPrices[recommendationKey])}
                                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    </span>
                                  );
                                }
                                
                                // Caso contrário, usar o preço atual da recomendação
                                return formatCurrency(rec.current_price);
                              })()}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Preço Sugerido:</span>
                            <p className="font-semibold text-green-600">
                              {(() => {
                                const recommendationKey = `${rec.category_id}-${rec.date}`;
                                const selectedPlanId = selectedPlansForRecommendations[recommendationKey] || rec.pricing_plan_id;
                                // Se há um plano selecionado diferente do original e há preço sugerido calculado, usar ele
                                if (selectedPlanId && selectedPlanId !== rec.pricing_plan_id && calculatedSuggestedPrices[recommendationKey]) {
                                  return formatCurrency(calculatedSuggestedPrices[recommendationKey]);
                                }
                                // Caso contrário, usar o preço sugerido da recomendação
                                return formatCurrency(rec.suggested_price);
                              })()}
                            </p>
                          </div>
                          <div>
                            <span className="text-gray-500">Impacto na Receita:</span>
                            <p className={`font-semibold ${(() => {
                              const recommendationKey = `${rec.category_id}-${rec.date}`;
                              const selectedPlanId = selectedPlansForRecommendations[recommendationKey] || rec.pricing_plan_id;
                              if (selectedPlanId && selectedPlanId !== rec.pricing_plan_id && calculatedSuggestedPrices[recommendationKey] && planPrices[recommendationKey]) {
                                const currentPrice = planPrices[recommendationKey];
                                const suggestedPrice = calculatedSuggestedPrices[recommendationKey];
                                const impact = suggestedPrice - currentPrice;
                                return impact >= 0 ? 'text-green-600' : 'text-red-600';
                              }
                              return rec.estimated_revenue_impact >= 0 ? 'text-green-600' : 'text-red-600';
                            })()}`}>
                              {(() => {
                                const recommendationKey = `${rec.category_id}-${rec.date}`;
                                const selectedPlanId = selectedPlansForRecommendations[recommendationKey] || rec.pricing_plan_id;
                                // Se há um plano selecionado diferente do original, calcular impacto baseado nos novos preços
                                if (selectedPlanId && selectedPlanId !== rec.pricing_plan_id && calculatedSuggestedPrices[recommendationKey] && planPrices[recommendationKey]) {
                                  const currentPrice = planPrices[recommendationKey];
                                  const suggestedPrice = calculatedSuggestedPrices[recommendationKey];
                                  // O impacto é a diferença entre preço sugerido e atual
                                  // Para uma estimativa mais precisa, precisaríamos da quantidade de quartos disponíveis
                                  // Por enquanto, usamos apenas a diferença de preço
                                  const impact = suggestedPrice - currentPrice;
                                  return formatCurrency(impact);
                                }
                                // Caso contrário, usar o impacto da recomendação
                                return formatCurrency(rec.estimated_revenue_impact);
                              })()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1 max-w-xs">
                            <Label htmlFor={`plan-select-${rec.category_id}-${rec.date}`} className="text-sm text-gray-600 mb-1 block">
                              Plano Tarifário:
                            </Label>
                            <Select
                              value={selectedPlansForRecommendations[`${rec.category_id}-${rec.date}`] || rec.pricing_plan_id || ''}
                              disabled={isApplying}
                              onValueChange={async (value) => {
                                const recommendationKey = `${rec.category_id}-${rec.date}`;
                                const previousPlanId = selectedPlansForRecommendations[recommendationKey] || rec.pricing_plan_id;
                                
                                // Se o plano foi trocado, limpar os preços atualizados para forçar recálculo
                                if (previousPlanId !== value) {
                                  setUpdatedPrices(prev => {
                                    const updated = { ...prev };
                                    delete updated[recommendationKey];
                                    return updated;
                                  });
                                }
                                
                                setSelectedPlansForRecommendations(prev => ({
                                  ...prev,
                                  [recommendationKey]: value
                                }));
                                
                                // Buscar o preço atual do plano selecionado e calcular o preço sugerido
                                if (establishmentId && rec.category_id && rec.date) {
                                  try {
                                    const dateStr = format(new Date(rec.date), 'yyyy-MM-dd');
                                    
                                    // Buscar preço atual do plano
                                    const { data: rateData, error: rateError } = await supabase
                                      .from('rate_calendar')
                                      .select('base_price')
                                      .eq('establishment_id', establishmentId)
                                      .eq('category_id', rec.category_id)
                                      .eq('pricing_plan_id', value)
                                      .eq('date', dateStr)
                                      .maybeSingle();
                                    
                                    let currentPrice = rateData?.base_price;
                                    
                                    // Se não encontrou no calendário, buscar preço base da categoria
                                    if (!currentPrice) {
                                      const category = categories.find((c: any) => c.id === rec.category_id);
                                      currentPrice = category?.base_price || 0;
                                    }
                                    
                                    if (currentPrice) {
                                      setPlanPrices(prev => ({
                                        ...prev,
                                        [recommendationKey]: currentPrice
                                      }));
                                      
                                      // Buscar ocupação para calcular preço sugerido
                                      const { count: occupiedCount } = await supabase
                                        .from('reservations')
                                        .select('*', { count: 'exact', head: true })
                                        .eq('establishment_id', establishmentId)
                                        .eq('category_id', rec.category_id)
                                        .gte('checkin_date', dateStr)
                                        .lt('checkout_date', dateStr)
                                        .neq('status', 'cancelled');
                                      
                                      const { count: roomsCount } = await supabase
                                        .from('rooms')
                                        .select('*', { count: 'exact', head: true })
                                        .eq('establishment_id', establishmentId)
                                        .eq('category_id', rec.category_id);
                                      
                                      const occupiedRooms = occupiedCount || 0;
                                      const availableRooms = roomsCount || 0;
                                      
                                      if (availableRooms > 0) {
                                        const occupancy = (occupiedRooms / availableRooms) * 100;
                                        
                                        // Buscar configurações de recomendação
                                        const { data: settingsData } = await supabase
                                          .from('hotel_settings')
                                          .select('rate_system_settings')
                                          .eq('establishment_id', establishmentId)
                                          .maybeSingle();
                                        
                                        const settings = settingsData?.rate_system_settings as any;
                                        const highThreshold = settings?.recommendation_threshold_occupancy || 90;
                                        const lowThreshold = settings?.recommendation_threshold_low_occupancy || 30;
                                        const increasePercent = settings?.price_increase_percentage || 15;
                                        const decreasePercent = settings?.price_decrease_percentage || 10;
                                        
                                        // Calcular preço sugerido baseado na ocupação
                                        let suggestedPrice = currentPrice;
                                        if (occupancy >= highThreshold) {
                                          suggestedPrice = currentPrice * (1 + (increasePercent / 100));
                                        } else if (occupancy < lowThreshold) {
                                          suggestedPrice = currentPrice * (1 - (decreasePercent / 100));
                                        }
                                        
                                        setCalculatedSuggestedPrices(prev => ({
                                          ...prev,
                                          [recommendationKey]: suggestedPrice
                                        }));
                                      }
                                    }
                                  } catch (err) {
                                    console.error('Erro ao buscar preço do plano:', err);
                                  }
                                }
                              }}
                            >
                              <SelectTrigger id={`plan-select-${rec.category_id}-${rec.date}`} className="w-full">
                                <SelectValue placeholder="Selecione o plano" />
                              </SelectTrigger>
                              <SelectContent>
                                {ratePlans
                                  .filter(p => p.is_active)
                                  .map((plan) => (
                                    <SelectItem key={plan.id} value={plan.id}>
                                      {plan.name} {plan.code && `(${plan.code})`}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-end">
                            <Button
                              size="sm"
                              onClick={() => handleApplyRecommendation(rec)}
                              disabled={isApplying}
                              className={`gap-2 transition-all duration-200 ${
                                isApplying ? 'opacity-75 cursor-not-allowed' : 'hover:scale-105'
                              }`}
                            >
                              {isApplying ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" />
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
                    </div>
                  </Card>
                  );
                })}
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
        )}

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
            <Card className="p-6 overflow-hidden">
              <h3 className="font-semibold text-gray-900 mb-4">Performance por Plano Tarifário</h3>
              {metrics && metrics.revenueByPlan.length > 0 ? (
                <div className="space-y-4 min-w-0">
                  {(() => {
                    const maxRevenue = Math.max(...metrics.revenueByPlan.map((p) => p.revenue), 1);
                    return metrics.revenueByPlan.map((plan, idx) => (
                      <div key={idx} className="min-w-0">
                        <div className="flex justify-between items-baseline gap-2 text-sm mb-1">
                          <span className="text-gray-600 truncate">{plan.name}</span>
                          <span className="font-semibold text-gray-900 shrink-0">{formatCurrency(plan.revenue)}</span>
                        </div>
                        <div className="w-full min-w-0 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-600 h-2 rounded-full max-w-full"
                            style={{
                              width: `${Math.min((plan.revenue / maxRevenue) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>{plan.reservations} reservas</span>
                          <span>ADR: {formatCurrency(plan.adr)}</span>
                        </div>
                      </div>
                    ));
                  })()}
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
            <h3 className="font-semibold text-gray-900 mb-2">Forecast vs Actual</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Comparação da receita realizada no período com o mesmo período do ano anterior (baseline).
            </p>
            {forecastVsActualData.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Realizado</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(forecastVsActualSummary.totalActual)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Receita no período selecionado</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ano anterior</p>
                    <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(forecastVsActualSummary.totalForecast)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Mesmo período, ano passado</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Variação</p>
                    <p className={cn(
                      "text-xl font-bold mt-1",
                      forecastVsActualSummary.variation > 0 ? "text-green-600" : forecastVsActualSummary.variation < 0 ? "text-red-600" : "text-gray-900"
                    )}>
                      {forecastVsActualSummary.variation > 0 ? "+" : ""}{forecastVsActualSummary.variation.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Realizado vs ano anterior</p>
                  </div>
                </div>
                <div className="h-[400px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={forecastVsActualData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dateLabel" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `R$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => `Data: ${label}`}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const row = forecastVsActualData.find((d) => d.dateLabel === label);
                          return (
                            <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
                              <p className="font-medium mb-2">{label}</p>
                              <p className="text-blue-600">Realizado: {formatCurrency(row?.actualRevenue ?? 0)}</p>
                              <p className="text-slate-500">Ano anterior: {formatCurrency(row?.forecastRevenue ?? 0)}</p>
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Bar dataKey="actualRevenue" name="Realizado" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="forecastRevenue" name="Ano anterior" fill="#94A3B8" radius={[2, 2, 0, 0]} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>Nenhum dado no período selecionado.</p>
                  <p className="text-sm text-gray-400 mt-1">Altere o período no seletor de datas para comparar realizado vs ano anterior.</p>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
