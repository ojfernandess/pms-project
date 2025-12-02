import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePricing } from "@/hooks/usePricing";
import { formatCurrency, formatDate } from "@/lib/reservationUtils";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar, Loader2, Save } from "lucide-react";

interface SimplePricingCalendarProps {
  planId: string;
  onSuccess?: () => void;
}

export const SimplePricingCalendar = ({ planId, onSuccess }: SimplePricingCalendarProps) => {
  const { createSeason, createRule } = usePricing();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [priceValue, setPriceValue] = useState<string>("");
  const [priceType, setPriceType] = useState<"multiplier" | "fixed">("multiplier");
  const [saving, setSaving] = useState(false);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Buscar categorias
  const { data: categories, isLoading: loadingCategories } = useQuery({
    queryKey: ["room_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  // Calcular dias do mês
  const monthDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    
    // Dias do mês anterior (para preencher a primeira semana)
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month, -i);
      days.push({ date, isCurrentMonth: false });
    }

    // Dias do mês atual
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      days.push({ date, isCurrentMonth: true });
    }

    // Dias do próximo mês (para completar a última semana)
    const remainingDays = 42 - days.length; // 6 semanas * 7 dias
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      days.push({ date, isCurrentMonth: false });
    }

    return days;
  }, [currentMonth]);

  const toggleDate = (date: Date) => {
    if (!selectedCategory) {
      toast.error("Selecione uma categoria primeiro");
      return;
    }

    const dateStr = date.toISOString().split("T")[0];
    const newSelected = new Set(selectedDates);
    
    if (newSelected.has(dateStr)) {
      newSelected.delete(dateStr);
    } else {
      newSelected.add(dateStr);
    }
    
    setSelectedDates(newSelected);
  };

  const handleMouseDown = (date: Date) => {
    if (!selectedCategory) {
      toast.error("Selecione uma categoria primeiro");
      return;
    }

    const dateStr = date.toISOString().split("T")[0];
    setDragStart(dateStr);
    setIsDragging(true);
  };

  const handleMouseEnter = (date: Date) => {
    if (!isDragging || !dragStart) return;

    const dateStr = date.toISOString().split("T")[0];
    let start = new Date(dragStart);
    let end = new Date(dateStr);
    
    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }

    const newSelected = new Set(selectedDates);
    const current = new Date(start);
    
    while (current <= end) {
      const currentStr = current.toISOString().split("T")[0];
      newSelected.add(currentStr);
      current.setDate(current.getDate() + 1);
    }
    
    setSelectedDates(newSelected);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  const clearSelection = () => {
    setSelectedDates(new Set());
  };

  const handleSave = async () => {
    if (!selectedCategory) {
      toast.error("Selecione uma categoria");
      return;
    }

    if (selectedDates.size === 0) {
      toast.error("Selecione pelo menos uma data");
      return;
    }

    if (!priceValue) {
      toast.error("Defina um preço ou multiplicador");
      return;
    }

    setSaving(true);

    try {
      const datesArray = Array.from(selectedDates).sort();
      const startDate = datesArray[0];
      const endDate = datesArray[datesArray.length - 1];

      // Criar temporada para o período
      const seasonName = `Período ${formatDate(startDate)} - ${formatDate(endDate)}`;
      const multiplier = priceType === "multiplier" ? parseFloat(priceValue) : 1.0;

      const { data: season, error: seasonError } = await supabase
        .from("pricing_seasons")
        .insert([{
          name: seasonName,
          start_date: startDate,
          end_date: endDate,
          multiplier: multiplier,
          is_active: true,
        }])
        .select()
        .single();

      if (seasonError) throw seasonError;

      // Criar regra de precificação
      const ruleData: any = {
        category_id: selectedCategory,
        season_id: season.id,
        is_active: true,
        pricing_plan_id: planId,
      };

      if (priceType === "fixed") {
        ruleData.price_override = parseFloat(priceValue);
      } else {
        ruleData.multiplier = parseFloat(priceValue);
      }

      const { error: ruleError } = await supabase
        .from("pricing_rules")
        .insert([ruleData]);

      if (ruleError) throw ruleError;

      toast.success("Tarifário aplicado com sucesso!");
      
      // Limpar seleção
      setSelectedDates(new Set());
      setPriceValue("");
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar tarifário");
    } finally {
      setSaving(false);
    }
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(currentMonth);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentMonth(newDate);
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Controles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="category">Categoria *</Label>
            <Select
              value={selectedCategory}
              onValueChange={(value) => {
                setSelectedCategory(value);
                setSelectedDates(new Set());
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((category: any) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name} - {formatCurrency(category.base_price)}/noite
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="price_type">Tipo de Preço</Label>
            <Select value={priceType} onValueChange={(value: "multiplier" | "fixed") => setPriceType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multiplier">Multiplicador (ex: 1.5 = 150%)</SelectItem>
                <SelectItem value="fixed">Preço Fixo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="price_value">
              {priceType === "multiplier" ? "Multiplicador *" : "Preço Fixo *"}
            </Label>
            <Input
              id="price_value"
              type="number"
              step="0.01"
              min="0"
              value={priceValue}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder={priceType === "multiplier" ? "Ex: 1.5" : "Ex: 250.00"}
            />
          </div>
        </div>

        {/* Calendário */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateMonth("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-lg font-semibold min-w-[200px] text-center">
                {currentMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </h3>
              <Button variant="outline" size="sm" onClick={() => navigateMonth("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoje
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={clearSelection}>
                Limpar Seleção
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={!selectedCategory || selectedDates.size === 0 || !priceValue || saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Aplicar Tarifário
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendário */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day, index) => {
              const dateStr = day.date.toISOString().split("T")[0];
              const isSelected = selectedDates.has(dateStr);
              const isToday = dateStr === new Date().toISOString().split("T")[0];
              const isPast = day.date < new Date() && day.date.toDateString() !== new Date().toDateString();

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => day.isCurrentMonth && !isPast && toggleDate(day.date)}
                  onMouseDown={() => day.isCurrentMonth && !isPast && handleMouseDown(day.date)}
                  onMouseEnter={() => day.isCurrentMonth && !isPast && handleMouseEnter(day.date)}
                  onMouseUp={handleMouseUp}
                  disabled={!day.isCurrentMonth || isPast || !selectedCategory}
                  className={cn(
                    "h-12 rounded-md text-sm transition-colors",
                    !day.isCurrentMonth && "text-muted-foreground/30",
                    isPast && day.isCurrentMonth && "opacity-50 cursor-not-allowed",
                    day.isCurrentMonth && !isPast && "hover:bg-muted cursor-pointer",
                    isSelected && "bg-primary text-primary-foreground font-bold",
                    isToday && !isSelected && "ring-2 ring-primary",
                    !isSelected && day.isCurrentMonth && !isPast && "bg-background"
                  )}
                >
                  {day.date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Informações */}
          <div className="mt-4 p-3 bg-muted rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium">Datas selecionadas:</span>{" "}
                <span className="text-muted-foreground">
                  {selectedDates.size > 0
                    ? `${selectedDates.size} data(s) - ${formatDate(Array.from(selectedDates).sort()[0])} até ${formatDate(Array.from(selectedDates).sort()[selectedDates.size - 1])}`
                    : "Nenhuma data selecionada"}
                </span>
              </div>
              {selectedCategory && priceValue && (
                <div className="text-right">
                  <span className="font-medium">Preço aplicado:</span>{" "}
                  <span className="text-primary">
                    {priceType === "multiplier"
                      ? `${(parseFloat(priceValue) * 100).toFixed(0)}% do preço base`
                      : formatCurrency(parseFloat(priceValue))}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instruções */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-medium">Como usar:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Selecione uma categoria de quarto</li>
            <li>Escolha o tipo de preço (multiplicador ou fixo)</li>
            <li>Defina o valor</li>
            <li>Clique nas datas do calendário para selecioná-las</li>
            <li>Clique em "Aplicar Tarifário" para salvar</li>
          </ul>
        </div>
      </div>
    </Card>
  );
};

