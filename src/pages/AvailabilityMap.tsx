import { useState, useMemo, Fragment } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, eachDayOfInterval, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAvailabilityMap } from "@/hooks/useAvailabilityMap";
import { useRateSystem } from "@/hooks/useRateSystem";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";

export default function AvailabilityMap() {
  const { selectedEstablishment } = useEstablishment();
  
  // Verificar se a funcionalidade está habilitada
  const { data: siteSettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["site_settings_feature_check"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("features_enabled")
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isFeatureEnabled = isFeatureEnabledForEstablishment(
    siteSettings?.features_enabled?.availability_map,
    selectedEstablishment?.id
  );
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [viewDays, setViewDays] = useState(11); // 11 dias por padrão (como na imagem)
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedRatePlan, setSelectedRatePlan] = useState<string>("all");
  const [viewMode, setViewMode] = useState<string>("availability");

  const endDate = useMemo(() => {
    return addDays(startDate, viewDays - 1);
  }, [startDate, viewDays]);

  const visibleDates = useMemo(() => {
    return eachDayOfInterval({
      start: startOfDay(startDate),
      end: startOfDay(endDate),
    });
  }, [startDate, endDate]);

  // Buscar categorias
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ["availability_categories", selectedEstablishment?.id],
    queryFn: async () => {
      if (!selectedEstablishment?.id) return [];
      const { data, error } = await supabase
        .from("room_categories")
        .select("id, name")
        .eq("establishment_id", selectedEstablishment.id)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedEstablishment?.id,
  });

  // Buscar planos tarifários
  const { ratePlans = [] } = useRateSystem();

  // Buscar disponibilidades
  const { availability, isLoading: isLoadingAvailability } = useAvailabilityMap(
    startDate,
    endDate,
    selectedCategory === "all" ? undefined : selectedCategory,
    selectedRatePlan === "all" ? undefined : selectedRatePlan
  );

  // Filtrar categorias
  const filteredCategories = useMemo(() => {
    if (selectedCategory === "all") {
      return availability;
    }
    return availability.filter((a) => a.categoryId === selectedCategory);
  }, [availability, selectedCategory]);

  const handleSearch = () => {
    // A busca já é feita automaticamente quando os filtros mudam
    // Este handler pode ser usado para ações adicionais se necessário
  };

  // Se a funcionalidade não está habilitada, mostrar mensagem
  if (!isLoadingSettings && !isFeatureEnabled) {
    return (
      <div className="space-y-6 p-6">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <AlertCircle className="h-8 w-8 text-amber-500" />
            <div>
              <h2 className="text-xl font-semibold text-slate-900 mb-1">
                Funcionalidade Desabilitada
              </h2>
              <p className="text-slate-600">
                O Mapa de Disponibilidades está desabilitado para este estabelecimento. 
                Entre em contato com o administrador do sistema para habilitar esta funcionalidade.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Mapa de Disponibilidades</h1>
          <p className="text-slate-600 mt-1">
            Visualize a disponibilidade de quartos por categoria e data
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <Label className="mb-2 block">Plano de Tarifa</Label>
            <Select value={selectedRatePlan} onValueChange={setSelectedRatePlan}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {ratePlans
                  .filter((p) => p.is_active)
                  .map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Label className="mb-2 block">Categoria</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Label className="mb-2 block">Data Inicial</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && setStartDate(date)}
                  initialFocus
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Label className="mb-2 block">Visualização</Label>
            <Select value={viewMode} onValueChange={setViewMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="availability">Disponibilidade</SelectItem>
                <SelectItem value="occupancy">Ocupação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Button onClick={handleSearch} className="bg-blue-600 hover:bg-blue-700">
              <Search className="mr-2 h-4 w-4" />
              Pesquisar
            </Button>
          </div>
        </div>
      </Card>

      {/* Grid de Disponibilidades */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          {isLoadingAvailability || isLoadingCategories ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-slate-600">Carregando disponibilidades...</p>
              </div>
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-slate-600">Nenhuma categoria encontrada</p>
            </div>
          ) : (
            <div className="min-w-full">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white border border-slate-200 p-3 text-left font-semibold text-slate-900 min-w-[200px]">
                      Categoria / Quarto
                    </th>
                    {visibleDates.map((date) => (
                      <th
                        key={format(date, "yyyy-MM-dd")}
                        className="border border-slate-200 p-2 text-center bg-slate-50 min-w-[100px]"
                      >
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-slate-600 uppercase">
                            {format(date, "MMM", { locale: ptBR })}
                          </span>
                          <span className="text-xs text-slate-500">
                            {format(date, "EEE", { locale: ptBR })}
                          </span>
                          <span className="text-sm font-bold text-slate-900">
                            {format(date, "d")}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((category) => (
                    <Fragment key={category.categoryId}>
                      {/* Linha Total da Categoria */}
                      <tr className="bg-slate-50 hover:bg-slate-100">
                        <td className="sticky left-0 z-10 bg-slate-50 border border-slate-200 p-3 font-bold text-slate-900">
                          <div className="flex flex-col">
                            <span>{category.categoryName}</span>
                            {category.buildingName && (
                              <span className="text-xs font-normal text-slate-600 mt-0.5">
                                {category.buildingName}
                              </span>
                            )}
                          </div>
                        </td>
                        {visibleDates.map((date) => {
                          const dateStr = format(date, "yyyy-MM-dd");
                          const available = category.dates[dateStr] ?? 0;
                          return (
                            <td
                              key={dateStr}
                              className="border border-slate-200 p-2 text-center bg-white"
                            >
                              <Input
                                type="number"
                                value={available}
                                readOnly
                                className="w-16 mx-auto text-center font-semibold bg-white border-slate-300 focus:border-slate-400"
                              />
                            </td>
                          );
                        })}
                      </tr>
                      {/* Linhas dos Quartos Individuais */}
                      {category.rooms.map((room) => (
                        <tr key={room.roomId} className="hover:bg-slate-50">
                          <td className="sticky left-0 z-10 bg-white border border-slate-200 p-3 pl-8 text-slate-700">
                            {room.roomNumber}
                          </td>
                          {visibleDates.map((date) => {
                            const dateStr = format(date, "yyyy-MM-dd");
                            const available = room.dates[dateStr] ?? 0;
                            return (
                              <td
                                key={dateStr}
                                className="border border-slate-200 p-2 text-center bg-white"
                              >
                                <Input
                                  type="number"
                                  value={available}
                                  readOnly
                                  min={0}
                                  max={1}
                                  className={cn(
                                    "w-16 mx-auto text-center border-slate-300 focus:border-slate-400",
                                    available === 1
                                      ? "bg-green-50 text-green-700 border-green-200"
                                      : "bg-red-50 text-red-700 border-red-200"
                                  )}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

