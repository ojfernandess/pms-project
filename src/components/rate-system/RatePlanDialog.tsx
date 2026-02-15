import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { RatePlan } from "@/hooks/useRateSystem";
import { usePlanTypes } from "@/hooks/usePlanTypes";
import { useCancellationPolicies } from "@/hooks/useCancellationPolicies";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useQuery } from "@tanstack/react-query";

interface RatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: RatePlan | null;
  onSave: (plan: Partial<RatePlan>) => Promise<any>;
}

export const RatePlanDialog = ({
  open,
  onOpenChange,
  plan,
  onSave,
}: RatePlanDialogProps) => {
  const { activePlanTypes } = usePlanTypes();
  const { policies } = useCancellationPolicies();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [planType, setPlanType] = useState<string>("");
  const [cancellationPolicyId, setCancellationPolicyId] = useState<string>("");
  const [requiresCard, setRequiresCard] = useState(false);
  const [basePlanId, setBasePlanId] = useState<string>("");
  const [mealPlan, setMealPlan] = useState("");
  const [minNights, setMinNights] = useState("");
  const [maxNights, setMaxNights] = useState("");
  const [label, setLabel] = useState("");
  const [immediateConfirmation, setImmediateConfirmation] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [fluctuationType, setFluctuationType] = useState<"percentage" | "fixed" | "">("");
  const [fluctuationValue, setFluctuationValue] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Buscar categorias disponíveis
  const { data: categories = [] } = useQuery({
    queryKey: ["room_categories", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("room_categories")
        .select("id, name")
        .eq("establishment_id", establishmentId)
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  // Buscar planos tarifários para usar como tarifa base
  const { data: allPlans = [] } = useQuery({
    queryKey: ["all_pricing_plans", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("pricing_plans")
        .select("id, name")
        .eq("establishment_id", establishmentId)
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (plan && open) {
      setName(plan.name || "");
      setCode(plan.code || "");
      setDescription(plan.description || "");
      // Garantir que planType seja uma string válida
      setPlanType(plan.plan_type || "");
      setIsActive(plan.is_active ?? true);
      
      // Buscar dados completos do plano
      const loadPlanData = async () => {
        setIsLoadingData(true);
        try {
          const { data: planData } = await supabase
            .from("pricing_plans")
            .select(`
              *,
              cancellation_policy_id,
              base_plan_id_for_rate,
              requires_card,
              meal_plan,
              min_nights,
              max_nights,
              label,
              immediate_confirmation,
              available_in_booking_engine,
              booking_engine_label,
              fluctuation_type,
              fluctuation_value
            `)
            .eq("id", plan.id)
            .single();
          
          if (planData) {
            setCancellationPolicyId(planData.cancellation_policy_id || "");
            setRequiresCard(planData.requires_card || false);
            setBasePlanId(planData.base_plan_id_for_rate || "");
            setMealPlan(planData.meal_plan || "");
            setMinNights(planData.min_nights?.toString() || "");
            setMaxNights(planData.max_nights?.toString() || "");
            setLabel(planData.label || planData.booking_engine_label || "");
            setImmediateConfirmation(planData.immediate_confirmation ?? true);
            setFluctuationType(planData.fluctuation_type || "");
            setFluctuationValue(planData.fluctuation_value?.toString() || "");
          }

          // Buscar categorias associadas
          const { data: planCategories, error: categoriesError } = await supabase
            .from("pricing_plan_categories")
            .select("category_id")
            .eq("pricing_plan_id", plan.id);

          if (categoriesError) {
            console.error("Erro ao buscar categorias do plano:", categoriesError);
          }

          if (planCategories && planCategories.length > 0) {
            setSelectedCategories(planCategories.map((pc: any) => pc.category_id));
          } else {
            // Se não houver categorias, garantir que o array está vazio
            setSelectedCategories([]);
          }
        } catch (error) {
          console.error("Erro ao carregar dados do plano:", error);
        } finally {
          setIsLoadingData(false);
        }
      };
      
      loadPlanData();
    } else if (!plan && open) {
      // Reset form
      setName("");
      setCode("");
      setDescription("");
      setPlanType(activePlanTypes.length > 0 ? activePlanTypes[0].name : "__no_type_available__");
      setCancellationPolicyId("");
      setRequiresCard(false);
      setBasePlanId("");
      setMealPlan("");
      setMinNights("");
      setMaxNights("");
      setLabel("");
      setImmediateConfirmation(true);
      setSelectedCategories([]);
      setIsActive(true);
      setFluctuationType("");
      setFluctuationValue("");
    }
  }, [plan, open, activePlanTypes]);

  const handleSave = async () => {
    try {
      const planData: any = {
        name,
        code: code || undefined,
        description: description || undefined,
        plan_type: (planType && planType !== '__no_type_available__') ? planType : undefined,
        is_active: isActive,
        requires_card: requiresCard,
        base_plan_id_for_rate: basePlanId || null,
        meal_plan: mealPlan || null,
        min_nights: minNights ? parseInt(minNights) : null,
        max_nights: maxNights ? parseInt(maxNights) : null,
        label: label || null,
        immediate_confirmation: immediateConfirmation,
        available_in_booking_engine: true, // Sempre disponível no motor de reservas
        booking_engine_label: label || null,
        fluctuation_type: basePlanId && fluctuationType && fluctuationValue && fluctuationValue.trim() !== "" ? fluctuationType : null,
        fluctuation_value: basePlanId && fluctuationValue && fluctuationValue.trim() !== "" && !isNaN(parseFloat(fluctuationValue)) ? parseFloat(fluctuationValue) : null,
      };

      // Se estiver editando, incluir a política de cancelamento na atualização
      if (plan?.id) {
        planData.cancellation_policy_id = cancellationPolicyId || null;
      }

      // Salvar o plano
      const savedPlan = await onSave(planData);
      const planId = plan?.id || savedPlan?.id;

      if (planId) {
        // Atualizar política de cancelamento se necessário
        if (!plan?.id) {
          await supabase
            .from("pricing_plans")
            .update({ cancellation_policy_id: cancellationPolicyId || null })
            .eq("id", planId);
        }

        // Atualizar categorias associadas
        // Remover todas as associações existentes
        await supabase
          .from("pricing_plan_categories")
          .delete()
          .eq("pricing_plan_id", planId);

        // Adicionar novas associações
        if (selectedCategories.length > 0) {
          await supabase
            .from("pricing_plan_categories")
            .insert(
              selectedCategories.map((categoryId) => ({
                pricing_plan_id: planId,
                category_id: categoryId,
              }))
            );
        }
      }
    } catch (error) {
      console.error("Erro ao salvar plano:", error);
      throw error;
    }
  };

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {plan ? "Editar Plano de Tarifas" : "Novo Plano de Tarifas"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {/* Grid de 3 colunas */}
          <div className="grid grid-cols-3 gap-4">
            {/* Coluna 1 */}
            <div className="space-y-4">
              <div>
                <Label>
                  Nome do Plano de Tarifas: <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Reembolsável"
                  required
                />
              </div>
              <div>
                <Label>Exigir Cartão (Motor de reservas):</Label>
                <Select
                  value={requiresCard ? "sim" : "nao"}
                  onValueChange={(value) => setRequiresCard(value === "sim")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Tarifa Base: <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={basePlanId || "none"}
                  onValueChange={(value) => {
                    if (value === "none") {
                      setBasePlanId("");
                      setFluctuationType("");
                      setFluctuationValue("");
                    } else {
                      setBasePlanId(value);
                      // Inicializar com percentual se não tiver valor
                      if (!fluctuationType) {
                        setFluctuationType("percentage");
                        if (!fluctuationValue) {
                          setFluctuationValue("0");
                        }
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma tarifa base" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {allPlans
                      .filter((p: any) => !plan || p.id !== plan.id)
                      .map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Acomodações: <span className="text-red-500">*</span>
                </Label>
                <div className="border rounded-md p-2 min-h-[100px] max-h-[200px] overflow-y-auto">
                  {categories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma categoria disponível</p>
                  ) : (
                    <div className="space-y-2">
                      {categories.map((cat: any) => (
                        <div key={cat.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`cat-${cat.id}`}
                            checked={selectedCategories.includes(cat.id)}
                            onCheckedChange={() => toggleCategory(cat.id)}
                          />
                          <Label
                            htmlFor={`cat-${cat.id}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            {cat.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedCategories.map((catId) => {
                      const cat = categories.find((c: any) => c.id === catId);
                      return cat ? (
                        <Badge key={catId} variant="secondary" className="flex items-center gap-1">
                          {cat.name}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => toggleCategory(catId)}
                          />
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Coluna 2 */}
            <div className="space-y-4">
              <div>
                <Label>
                  Confirmação Imediata: <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={immediateConfirmation ? "sim" : "nao"}
                  onValueChange={(value) => setImmediateConfirmation(value === "sim")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mínimo de diárias:</Label>
                <Input
                  type="number"
                  min="0"
                  value={minNights}
                  onChange={(e) => setMinNights(e.target.value)}
                  placeholder="Ex: 2"
                />
              </div>
              {basePlanId && (
                <div>
                  <Label>
                    Flutuação: <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-0">
                    <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted">
                      <span className="text-sm text-muted-foreground">
                        {fluctuationType === "fixed" ? "R$" : ""}
                      </span>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      value={fluctuationValue}
                      onChange={(e) => setFluctuationValue(e.target.value)}
                      placeholder={fluctuationType === "fixed" ? "0.00" : "0"}
                      className="flex-1 rounded-none border-x-0"
                    />
                    <Select
                      value={fluctuationType || "percentage"}
                      onValueChange={(value: "percentage" | "fixed") => {
                        setFluctuationType(value);
                        if (!fluctuationValue) {
                          setFluctuationValue("0");
                        }
                      }}
                    >
                      <SelectTrigger className="w-20 rounded-l-none border-l-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">%</SelectItem>
                        <SelectItem value="fixed">R$</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fluctuationType === "fixed" 
                      ? "Valor fixo a ser adicionado ou subtraído da tarifa base"
                      : "Percentual a ser aplicado sobre a tarifa base (use negativo para desconto)"}
                  </p>
                </div>
              )}
              <div>
                <Label>Máximo de diárias:</Label>
                <Input
                  type="number"
                  min="0"
                  value={maxNights}
                  onChange={(e) => setMaxNights(e.target.value)}
                  placeholder="Ex: 7"
                />
              </div>
              <div>
                <Label>Tipo de Plano:</Label>
                <Select value={planType} onValueChange={(v: string) => setPlanType(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePlanTypes.length === 0 ? (
                      <SelectItem value="__no_type_available__" disabled>
                        Nenhum tipo disponível
                      </SelectItem>
                    ) : (
                      activePlanTypes.map((type) => (
                        <SelectItem key={type.id} value={type.name}>
                          <div className="flex items-center gap-2">
                            {type.color && (
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: type.color }}
                              />
                            )}
                            <span>{type.name}</span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Coluna 3 */}
            <div className="space-y-4">
              <div>
                <Label>Rótulo (Aparecerá no motor de reservas):</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ex: Reembolsável"
                />
              </div>
              <div>
                <Label>
                  Política de Cancelamento: <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={cancellationPolicyId || "none"}
                  onValueChange={(value) =>
                    setCancellationPolicyId(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma política" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {policies
                      .filter((p: any) => p.is_active)
                      .map((policy: any) => (
                        <SelectItem key={policy.id} value={policy.id}>
                          {policy.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição:</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrição do plano tarifário"
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked as boolean)}
                />
                <Label htmlFor="isActive" className="cursor-pointer">Ativo</Label>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={
              isLoadingData ||
              !name.trim() || 
              !planType ||
              planType === '__no_type_available__' ||
              selectedCategories.length === 0
            }
            title={
              isLoadingData 
                ? "Carregando dados do plano..." 
                : !name.trim() 
                ? "Nome do plano é obrigatório" 
                : !planType || planType === '__no_type_available__'
                ? "Tipo de plano é obrigatório" 
                : selectedCategories.length === 0 
                ? "Selecione pelo menos uma acomodação" 
                : "Clique para salvar as alterações"
            }
          >
            {isLoadingData ? "Carregando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
