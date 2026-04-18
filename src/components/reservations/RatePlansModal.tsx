import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { formatCurrencyWithoutZeroCents } from "@/lib/reservationUtils";
import { format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Calendar } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RatePlansModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  date: Date;
}

export const RatePlansModal = ({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  date,
}: RatePlansModalProps) => {
  const establishmentId = getSelectedEstablishmentId();
  // Normalizar a data para o início do dia para evitar problemas de timezone
  // A data já deve estar normalizada quando chega aqui, mas garantimos novamente
  const normalizedDate = startOfDay(date);
  // Formatar a data no timezone local para garantir que seja a mesma exibida no calendário
  const dateStr = format(normalizedDate, "yyyy-MM-dd");

  // Buscar todos os planos tarifários ativos
  const { data: ratePlans = [], isLoading: isLoadingPlans } = useQuery({
    queryKey: ["rate_plans", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return [];
      
      const { data, error } = await supabase
        .from("pricing_plans")
        .select("*")
        .eq("establishment_id", establishmentId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: open && !!establishmentId,
  });

  // Buscar preços do rate_calendar para a categoria e data
  const { data: rateCalendar = [], isLoading: isLoadingRates } = useQuery({
    queryKey: ["rate_calendar_modal", establishmentId, categoryId, dateStr],
    queryFn: async () => {
      if (!establishmentId || !categoryId || !dateStr) return [];
      
      const { data, error } = await supabase
        .from("rate_calendar")
        .select(`
          *,
          pricing_plans (*)
        `)
        .eq("establishment_id", establishmentId)
        .eq("category_id", categoryId)
        .eq("date", dateStr);

      if (error) throw error;
      
      // Ordenar no lado do cliente por sort_order do plano tarifário
      const sorted = (data || []).sort((a: any, b: any) => {
        const sortOrderA = a.pricing_plans?.sort_order ?? 999;
        const sortOrderB = b.pricing_plans?.sort_order ?? 999;
        if (sortOrderA !== sortOrderB) {
          return sortOrderA - sortOrderB;
        }
        // Se sort_order for igual, ordenar por nome
        const nameA = a.pricing_plans?.name || "";
        const nameB = b.pricing_plans?.name || "";
        return nameA.localeCompare(nameB);
      });
      
      return sorted;
    },
    enabled: open && !!establishmentId && !!categoryId && !!dateStr,
  });

  // Buscar preço base da categoria (fallback)
  const { data: categoryBasePrice = 0 } = useQuery({
    queryKey: ["category_base_price", categoryId],
    queryFn: async () => {
      if (!categoryId) return 0;
      
      const { data, error } = await supabase
        .from("room_categories")
        .select("base_price")
        .eq("id", categoryId)
        .single();

      if (error || !data) return 0;
      return Number(data.base_price || 0);
    },
    enabled: open && !!categoryId,
  });

  // Criar mapa de preços customizados por plano
  const customPriceMap = new Map<string, number>();
  rateCalendar.forEach((entry: any) => {
    if (entry.pricing_plan_id && entry.base_price) {
      customPriceMap.set(entry.pricing_plan_id, Number(entry.base_price));
    }
  });

  // Combinar planos com preços (base e customizado)
  const plansWithPrices = ratePlans.map((plan: any) => {
    const customPrice = customPriceMap.get(plan.id);
    const basePrice = categoryBasePrice;
    const displayPrice = customPrice ?? basePrice;
    return {
      ...plan,
      basePrice,
      customPrice,
      displayPrice,
      hasCustomPrice: customPriceMap.has(plan.id),
    };
  });

  const isLoading = isLoadingPlans || isLoadingRates;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Tarifários - {categoryName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Data: {format(normalizedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : plansWithPrices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum plano tarifário encontrado
          </div>
        ) : (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plano Tarifário</TableHead>
                  <TableHead className="text-right">Preço Base</TableHead>
                  <TableHead className="text-right">Preço Customizado</TableHead>
                  <TableHead className="text-center">Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plansWithPrices.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {plan.color && (
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: plan.color }}
                          />
                        )}
                        <div>
                          <div className="font-medium">{plan.name}</div>
                          {plan.code && (
                            <div className="text-xs text-muted-foreground">
                              {plan.code}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className={cn(
                          "font-semibold",
                          plan.hasCustomPrice && plan.customPrice !== plan.basePrice && "text-slate-500 line-through text-sm"
                        )}>
                          {formatCurrencyWithoutZeroCents(plan.basePrice)}
                        </span>
                        {!plan.hasCustomPrice && (
                          <span className="text-xs text-muted-foreground mt-1">
                            Em uso
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {plan.hasCustomPrice ? (
                        <div className="flex flex-col items-end">
                          <span className="font-semibold text-lg text-emerald-700">
                            {formatCurrencyWithoutZeroCents(plan.customPrice)}
                          </span>
                          {plan.customPrice !== plan.basePrice && (
                            <span className="text-xs text-emerald-600 mt-1">
                              {plan.customPrice > plan.basePrice ? '↑' : '↓'} {formatCurrencyWithoutZeroCents(Math.abs(plan.customPrice - plan.basePrice))}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">
                          Não definido
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {plan.plan_type && (
                        <Badge
                          variant="outline"
                          className={cn(
                            plan.plan_type === "Promotional" && "border-orange-300 text-orange-700",
                            plan.plan_type === "Package" && "border-purple-300 text-purple-700",
                            plan.plan_type === "Corporate" && "border-blue-300 text-blue-700",
                            plan.plan_type === "Group" && "border-green-300 text-green-700"
                          )}
                        >
                          {plan.plan_type}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
              <p>
                <strong>Preço Base:</strong> Valor padrão da categoria usado quando não há entrada específica no calendário tarifário.
              </p>
              <p>
                <strong>Preço Customizado:</strong> Valor definido especificamente para esta data no calendário tarifário.
              </p>
              {plansWithPrices.some((p) => p.hasCustomPrice && p.customPrice !== p.basePrice) && (
                <p className="text-emerald-600">
                  <strong>↑</strong> indica aumento | <strong>↓</strong> indica desconto em relação ao preço base.
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

