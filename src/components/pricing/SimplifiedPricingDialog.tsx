import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format, addDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { formatCurrency } from "@/lib/reservationUtils";
import { useChannelManager } from "@/hooks/useChannelManager";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { useEstablishment } from "@/contexts/EstablishmentContext";

interface SimplifiedPricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  pricingId?: string;
}

const weekDays = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

export const SimplifiedPricingDialog = ({
  open,
  onOpenChange,
  onSuccess,
  pricingId,
}: SimplifiedPricingDialogProps) => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();
  const { channels } = useChannelManager();
  const { plans } = usePricingPlans();

  const [formData, setFormData] = useState({
    pricing_plan_id: "",
    category_id: "",
    channel_id: "",
    channel_type: "direct",
    start_date: "",
    end_date: "",
    days_of_week: [] as number[],
    price: "",
    price_multiplier: "1.0",
    price_type: "multiplier" as "multiplier" | "fixed",
    is_active: true,
  });

  // Buscar categorias
  const { data: categories, isLoading: loadingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ["room_categories", establishmentId],
    queryFn: async () => {
      if (!establishmentId) {
        console.warn("Nenhum estabelecimento selecionado para buscar categorias");
        return [];
      }
      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("name");
      if (error) {
        console.error("Erro ao buscar categorias:", error);
        throw error;
      }
      return data || [];
    },
    enabled: !!establishmentId && open, // Só buscar quando o dialog estiver aberto e houver estabelecimento
  });

  // Refetch categorias quando o dialog abrir
  useEffect(() => {
    if (open && establishmentId) {
      refetchCategories();
    }
  }, [open, establishmentId, refetchCategories]);

  // Buscar tarifário existente se for edição
  const { data: existingPricing, isLoading: loadingPricing } = useQuery({
    queryKey: ["simplified_pricing", pricingId],
    queryFn: async () => {
      if (!pricingId) return null;
      const { data, error } = await supabase
        .from("simplified_pricing")
        .select("*")
        .eq("id", pricingId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!pricingId && open,
  });

  // Preencher formulário quando carregar tarifário existente
  useEffect(() => {
    if (existingPricing && open) {
      setFormData({
        pricing_plan_id: existingPricing.pricing_plan_id || "",
        category_id: existingPricing.category_id || "",
        channel_id: existingPricing.channel_id || "",
        channel_type: existingPricing.channel_type || "direct",
        start_date: existingPricing.start_date || "",
        end_date: existingPricing.end_date || "",
        days_of_week: existingPricing.days_of_week || [],
        price: existingPricing.price ? String(existingPricing.price) : "",
        price_multiplier: existingPricing.price_multiplier ? String(existingPricing.price_multiplier) : "1.0",
        price_type: existingPricing.price ? "fixed" : "multiplier",
        is_active: existingPricing.is_active ?? true,
      });
    } else if (!pricingId && open) {
      // Resetar formulário para novo tarifário
      setFormData({
        pricing_plan_id: "",
        category_id: "",
        channel_id: "",
        channel_type: "direct",
        start_date: "",
        end_date: "",
        days_of_week: [],
        price: "",
        price_multiplier: "1.0",
        price_type: "multiplier",
        is_active: true,
      });
    }
  }, [existingPricing, pricingId, open]);

  // Criar/Atualizar tarifário
  const createOrUpdatePricing = useMutation({
    mutationFn: async (data: any) => {
      if (pricingId) {
        const { data: updated, error } = await supabase
          .from("simplified_pricing")
          .update(data)
          .eq("id", pricingId)
          .select()
          .single();
        if (error) throw error;
        return updated;
      } else {
        const { data: created, error } = await supabase
          .from("simplified_pricing")
          .insert([data])
          .select()
          .single();
        if (error) throw error;
        return created;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["simplified_pricing"] });
      queryClient.invalidateQueries({ queryKey: ["pricing_seasons"] });
      queryClient.invalidateQueries({ queryKey: ["pricing_rules"] });
      // Invalidar cache de preços do mapa de reservas
      queryClient.invalidateQueries({ queryKey: ["room_categories_with_rooms"] });
      toast.success(pricingId ? "Tarifário atualizado com sucesso!" : "Tarifário criado com sucesso!");
      onOpenChange(false);
      if (onSuccess) onSuccess();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar tarifário");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.pricing_plan_id) {
      toast.error("Selecione um plano de tarifa");
      return;
    }

    if (!formData.category_id) {
      toast.error("Selecione uma categoria de quarto");
      return;
    }

    if (!formData.start_date && formData.days_of_week.length === 0) {
      toast.error("Selecione datas ou dias da semana");
      return;
    }

    if (formData.price_type === "fixed" && !formData.price) {
      toast.error("Defina um preço fixo");
      return;
    }

    if (formData.price_type === "multiplier" && !formData.price_multiplier) {
      toast.error("Defina um multiplicador");
      return;
    }

    const submitData: any = {
      establishment_id: establishmentId,
      pricing_plan_id: formData.pricing_plan_id,
      category_id: formData.category_id,
      channel_type: formData.channel_type,
      is_active: formData.is_active,
    };

    // Se canal OTA foi selecionado
    if (formData.channel_type === "ota" && formData.channel_id) {
      submitData.channel_id = formData.channel_id;
    } else {
      submitData.channel_id = null;
    }

    // Datas ou dias da semana
    if (formData.start_date) {
      submitData.start_date = formData.start_date;
      submitData.end_date = formData.end_date || formData.start_date;
    }

    if (formData.days_of_week.length > 0) {
      submitData.days_of_week = formData.days_of_week;
    }

    // Preço
    if (formData.price_type === "fixed") {
      submitData.price = parseFloat(formData.price);
      submitData.price_multiplier = null;
    } else {
      submitData.price_multiplier = parseFloat(formData.price_multiplier);
      submitData.price = null;
    }

    createOrUpdatePricing.mutate(submitData);
  };

  const toggleDayOfWeek = (day: number) => {
    const newDays = formData.days_of_week.includes(day)
      ? formData.days_of_week.filter((d) => d !== day)
      : [...formData.days_of_week, day].sort();
    setFormData({ ...formData, days_of_week: newDays });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pricingId ? "Editar Tarifário" : "Novo Tarifário"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Plano de Tarifa */}
          <div>
            <Label htmlFor="pricing_plan_id">Plano de Tarifa *</Label>
            <Select
              value={formData.pricing_plan_id}
              onValueChange={(value) => setFormData({ ...formData, pricing_plan_id: value })}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um plano (ex: Balcão, Motor de Reserva)" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan: any) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Categoria */}
          <div>
            <Label htmlFor="category_id">Categoria de Quarto *</Label>
            {loadingCategories ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando categorias...
              </div>
            ) : (
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                required
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
            )}
          </div>

          {/* Canal */}
          <div>
            <Label htmlFor="channel_type">Canal *</Label>
            <Select
              value={formData.channel_type}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  channel_type: value,
                  channel_id: value !== "ota" ? "" : formData.channel_id,
                })
              }
              required
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Balcão / Direto</SelectItem>
                <SelectItem value="ota">OTA (Booking, Airbnb, etc)</SelectItem>
                <SelectItem value="booking">Booking.com</SelectItem>
                <SelectItem value="airbnb">Airbnb</SelectItem>
                <SelectItem value="expedia">Expedia</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Canal OTA específico (se selecionado) */}
          {formData.channel_type === "ota" && (
            <div>
              <Label htmlFor="channel_id">Canal OTA Específico</Label>
              <Select
                value={formData.channel_id}
                onValueChange={(value) => setFormData({ ...formData, channel_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um canal OTA (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map((channel: any) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Datas ou Dias da Semana */}
          <div className="space-y-2">
            <Label>Período *</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date" className="text-sm">Data Inicial</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.start_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.start_date ? format(new Date(formData.start_date), "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.start_date ? new Date(formData.start_date) : undefined}
                      onSelect={(date) =>
                        setFormData({
                          ...formData,
                          start_date: date ? format(date, "yyyy-MM-dd") : "",
                        })
                      }
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="end_date" className="text-sm">Data Final (opcional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formData.end_date && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.end_date ? format(new Date(formData.end_date), "dd/MM/yyyy", { locale: ptBR }) : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formData.end_date ? new Date(formData.end_date) : undefined}
                      onSelect={(date) =>
                        setFormData({
                          ...formData,
                          end_date: date ? format(date, "yyyy-MM-dd") : "",
                        })
                      }
                      locale={ptBR}
                      disabled={(date) => formData.start_date ? date < new Date(formData.start_date) : false}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="mb-2">OU selecione dias da semana:</p>
              <div className="grid grid-cols-2 gap-2">
                {weekDays.map((day) => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`day-${day.value}`}
                      checked={formData.days_of_week.includes(day.value)}
                      onCheckedChange={() => toggleDayOfWeek(day.value)}
                    />
                    <Label htmlFor={`day-${day.value}`} className="text-sm font-normal cursor-pointer">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tipo de Preço */}
          <div>
            <Label htmlFor="price_type">Tipo de Preço</Label>
            <Select
              value={formData.price_type}
              onValueChange={(value: "multiplier" | "fixed") =>
                setFormData({ ...formData, price_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="multiplier">Multiplicador (ex: 1.5 = 150% do preço base)</SelectItem>
                <SelectItem value="fixed">Preço Fixo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Valor do Preço */}
          {formData.price_type === "fixed" ? (
            <div>
              <Label htmlFor="price">Preço Fixo *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="Ex: 250.00"
                required
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="price_multiplier">Multiplicador *</Label>
              <Input
                id="price_multiplier"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.price_multiplier}
                onChange={(e) => setFormData({ ...formData, price_multiplier: e.target.value })}
                placeholder="Ex: 1.5 (150%)"
                required
              />
              {formData.category_id && categories && (
                <p className="text-xs text-muted-foreground mt-1">
                  Preço base: {formatCurrency(categories.find((c: any) => c.id === formData.category_id)?.base_price || 0)} × {formData.price_multiplier} ={" "}
                  {formatCurrency(
                    (categories.find((c: any) => c.id === formData.category_id)?.base_price || 0) *
                      parseFloat(formData.price_multiplier || "1")
                  )}
                  /noite
                </p>
              )}
            </div>
          )}

          {/* Status */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_active: checked as boolean })
              }
            />
            <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
              Tarifário ativo
            </Label>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createOrUpdatePricing.isPending}>
              {createOrUpdatePricing.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : pricingId ? (
                "Atualizar"
              ) : (
                "Criar Tarifário"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

