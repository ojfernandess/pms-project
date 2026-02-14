import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface CancellationPolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  policyId?: string;
}

const FREE_CANCELLATION_DEADLINES = [
  "até 18:00 do dia da chegada",
  "até 14:00 do dia da chegada",
  "até 1 dia antes da chegada",
  "até 2 dias antes da chegada",
  "até 3 dias antes da chegada",
  "até 5 dias antes da chegada",
  "até 7 dias antes da chegada",
  "até 14 dias antes da chegada",
  "até 21 dias antes da chegada",
  "até 30 dias antes da chegada",
  "até 42 dias antes da chegada",
  "até 60 dias antes da chegada",
];

const CANCELLATION_FEE_WHEN_OPTIONS = [
  "em qualquer momento",
  "até 1 dia antes da chegada",
  "até 2 dias antes da chegada",
  "até 3 dias antes da chegada",
  "até 5 dias antes da chegada",
  "até 7 dias antes da chegada",
  "até 14 dias antes da chegada",
  "até 21 dias antes da chegada",
  "até 30 dias antes da chegada",
  "até 42 dias antes da chegada",
  "até 60 dias antes da chegada",
];

const FEE_OPTIONS = [
  { value: "first_night", label: "o custo da primeira diária" },
  { value: "10", label: "de 10% do preço total" },
  { value: "20", label: "de 20% do preço total" },
  { value: "30", label: "de 30% do preço total" },
  { value: "40", label: "de 40% do preço total" },
  { value: "50", label: "de 50% do preço total" },
  { value: "60", label: "de 60% do preço total" },
  { value: "70", label: "de 70% do preço total" },
  { value: "80", label: "de 80% do preço total" },
  { value: "90", label: "de 90% do preço total" },
  { value: "100", label: "de 100% do preço total" },
];

const NO_SHOW_OPTIONS = [
  { value: "same_as_cancellation", label: "O mesmo valor da taxa de cancelamento" },
  { value: "first_night", label: "o custo da primeira diária" },
  { value: "10", label: "de 10% do preço total" },
  { value: "20", label: "de 20% do preço total" },
  { value: "30", label: "de 30% do preço total" },
  { value: "40", label: "de 40% do preço total" },
  { value: "50", label: "de 50% do preço total" },
  { value: "60", label: "de 60% do preço total" },
  { value: "70", label: "de 70% do preço total" },
  { value: "80", label: "de 80% do preço total" },
  { value: "90", label: "de 90% do preço total" },
  { value: "100", label: "de 100% do preço total" },
];

export const CancellationPolicyDialog = ({
  open,
  onOpenChange,
  onSuccess,
  policyId,
}: CancellationPolicyDialogProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    has_free_cancellation: true,
    free_cancellation_deadline: "até 7 dias antes da chegada",
    cancellation_fee_type: "first_night" as "first_night" | "percentage",
    cancellation_fee_percentage: null as number | null,
    cancellation_fee_when: "em qualquer momento",
    cancellation_fee_after_deadline_type: "first_night" as "first_night" | "percentage" | null,
    cancellation_fee_after_deadline_percentage: null as number | null,
    no_show_fee_type: "same_as_cancellation" as "same_as_cancellation" | "first_night" | "percentage",
    no_show_fee_percentage: null as number | null,
    requires_prepayment: false,
    prepayment_percentage: null as number | null,
    prepayment_when: "before_free_cancellation_end" as "before_free_cancellation_end" | "after_free_cancellation_end",
    description: "",
    is_active: true,
  });

  // Gerar resumo da política automaticamente
  const policySummary = useMemo(() => {
    let summary = "";
    
    if (formData.has_free_cancellation && formData.free_cancellation_deadline) {
      summary += `O hóspede pode cancelar gratuitamente ${formData.free_cancellation_deadline}. `;
      
      if (formData.cancellation_fee_after_deadline_type) {
        if (formData.cancellation_fee_after_deadline_type === "first_night") {
          summary += `O hóspede deverá pagar o custo da primeira diária em caso de cancelamento após o prazo de cancelamento gratuito. `;
        } else if (formData.cancellation_fee_after_deadline_percentage) {
          summary += `O hóspede deverá pagar ${formData.cancellation_fee_after_deadline_percentage}% do preço total em caso de cancelamento após o prazo de cancelamento gratuito. `;
        }
      }
    } else {
      if (formData.cancellation_fee_type === "first_night") {
        summary += `O hóspede deverá pagar o custo da primeira diária em caso de cancelamento`;
        if (formData.cancellation_fee_when && formData.cancellation_fee_when !== "em qualquer momento") {
          summary += ` ${formData.cancellation_fee_when}`;
        }
        summary += `. `;
      } else if (formData.cancellation_fee_percentage) {
        summary += `O hóspede deverá pagar ${formData.cancellation_fee_percentage}% do preço total em caso de cancelamento`;
        if (formData.cancellation_fee_when && formData.cancellation_fee_when !== "em qualquer momento") {
          summary += ` ${formData.cancellation_fee_when}`;
        }
        summary += `. `;
      }
    }

    if (formData.no_show_fee_type === "same_as_cancellation") {
      summary += `Em caso de não comparecimento, será aplicada a mesma taxa de cancelamento.`;
    } else if (formData.no_show_fee_type === "first_night") {
      summary += `Em caso de não comparecimento, o hóspede será cobrado o custo da primeira diária.`;
    } else if (formData.no_show_fee_percentage) {
      summary += `Em caso de não comparecimento, o hóspede será cobrado ${formData.no_show_fee_percentage}% do preço total.`;
    }

    return summary || "Política de cancelamento configurada.";
  }, [formData]);

  // Gerar resumo do pré-pagamento
  const prepaymentSummary = useMemo(() => {
    if (!formData.requires_prepayment) {
      return "Você não exige pré-pagamento: em caso de cancelamento ou não comparecimento, você se responsabiliza por cobrar a taxa de cancelamento/não comparecimento diretamente do hóspede.";
    }

    let summary = `O hóspede será cobrado um pré-pagamento de ${formData.prepayment_percentage || 0}% do preço total após a reserva. `;
    
    if (formData.prepayment_when === "before_free_cancellation_end") {
      summary += "Você pode cobrar este pré-pagamento do hóspede a qualquer momento antes do fim do período de cancelamento grátis.";
    } else {
      summary += "Você pode cobrar este pré-pagamento do hóspede após o fim do período de cancelamento grátis.";
    }

    return summary;
  }, [formData]);

  useEffect(() => {
    if (policyId && open) {
      loadPolicy();
    } else if (!policyId && open) {
      resetForm();
    }
  }, [policyId, open]);

  const loadPolicy = async () => {
    if (!policyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cancellation_policies")
        .select("*")
        .eq("id", policyId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name || "",
          has_free_cancellation: data.has_free_cancellation ?? true,
          free_cancellation_deadline: data.free_cancellation_deadline || "até 7 dias antes da chegada",
          cancellation_fee_type: data.cancellation_fee_type === "percentage" ? "percentage" : "first_night",
          cancellation_fee_percentage: data.cancellation_fee_percentage || null,
          cancellation_fee_when: data.cancellation_fee_when || "em qualquer momento",
          cancellation_fee_after_deadline_type: data.cancellation_fee_after_deadline_type || null,
          cancellation_fee_after_deadline_percentage: data.cancellation_fee_after_deadline_percentage || null,
          no_show_fee_type: data.no_show_fee_type || "same_as_cancellation",
          no_show_fee_percentage: data.no_show_fee_percentage || null,
          requires_prepayment: data.requires_prepayment ?? false,
          prepayment_percentage: data.prepayment_percentage || null,
          prepayment_when: data.prepayment_when || "before_free_cancellation_end",
          description: data.description || "",
          is_active: data.is_active ?? true,
        });
      }
    } catch (error: any) {
      console.error("Erro ao carregar política:", error);
      toast.error("Erro ao carregar política de cancelamento");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      has_free_cancellation: true,
      free_cancellation_deadline: "até 7 dias antes da chegada",
      cancellation_fee_type: "first_night",
      cancellation_fee_percentage: null,
      cancellation_fee_when: "em qualquer momento",
      cancellation_fee_after_deadline_type: null,
      cancellation_fee_after_deadline_percentage: null,
      no_show_fee_type: "same_as_cancellation",
      no_show_fee_percentage: null,
      requires_prepayment: false,
      prepayment_percentage: null,
      prepayment_when: "before_free_cancellation_end",
      description: "",
      is_active: true,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) {
        toast.error("Estabelecimento não selecionado");
        return;
      }

      if (!formData.name.trim()) {
        toast.error("Nome da política é obrigatório");
        return;
      }

      const policyData: any = {
        establishment_id: establishmentId,
        name: formData.name.trim(),
        has_free_cancellation: formData.has_free_cancellation,
        free_cancellation_deadline: formData.has_free_cancellation ? formData.free_cancellation_deadline : null,
        cancellation_fee_type: formData.cancellation_fee_type,
        cancellation_fee_percentage: formData.cancellation_fee_type === "percentage" 
          ? formData.cancellation_fee_percentage 
          : null,
        cancellation_fee_when: formData.cancellation_fee_when,
        cancellation_fee_after_deadline_type: formData.cancellation_fee_after_deadline_type,
        cancellation_fee_after_deadline_percentage: formData.cancellation_fee_after_deadline_type === "percentage"
          ? formData.cancellation_fee_after_deadline_percentage
          : null,
        no_show_fee_type: formData.no_show_fee_type,
        no_show_fee_percentage: formData.no_show_fee_type === "percentage"
          ? formData.no_show_fee_percentage
          : null,
        requires_prepayment: formData.requires_prepayment,
        prepayment_percentage: formData.requires_prepayment ? formData.prepayment_percentage : null,
        prepayment_when: formData.requires_prepayment ? formData.prepayment_when : null,
        policy_summary: policySummary,
        prepayment_summary: prepaymentSummary,
        description: formData.description || null,
        is_active: formData.is_active,
      };

      if (policyId) {
        const { error } = await supabase
          .from("cancellation_policies")
          .update(policyData)
          .eq("id", policyId);

        if (error) throw error;
        toast.success("Política de cancelamento atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("cancellation_policies")
          .insert([policyData]);

        if (error) throw error;
        toast.success("Política de cancelamento criada com sucesso!");
      }

      queryClient.invalidateQueries({ queryKey: ["cancellation_policies"] });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar política:", error);
      toast.error(error.message || "Erro ao salvar política de cancelamento");
    } finally {
      setLoading(false);
    }
  };

  const handleFeeChange = (value: string) => {
    if (value === "first_night") {
      setFormData({
        ...formData,
        cancellation_fee_type: "first_night",
        cancellation_fee_percentage: null,
      });
    } else {
      const percentage = parseInt(value);
      setFormData({
        ...formData,
        cancellation_fee_type: "percentage",
        cancellation_fee_percentage: isNaN(percentage) ? null : percentage,
      });
    }
  };

  const handleAfterDeadlineFeeChange = (value: string) => {
    if (value === "first_night") {
      setFormData({
        ...formData,
        cancellation_fee_after_deadline_type: "first_night",
        cancellation_fee_after_deadline_percentage: null,
      });
    } else {
      const percentage = parseInt(value);
      setFormData({
        ...formData,
        cancellation_fee_after_deadline_type: "percentage",
        cancellation_fee_after_deadline_percentage: isNaN(percentage) ? null : percentage,
      });
    }
  };

  const handleNoShowFeeChange = (value: string) => {
    if (value === "same_as_cancellation") {
      setFormData({
        ...formData,
        no_show_fee_type: "same_as_cancellation",
        no_show_fee_percentage: null,
      });
    } else if (value === "first_night") {
      setFormData({
        ...formData,
        no_show_fee_type: "first_night",
        no_show_fee_percentage: null,
      });
    } else {
      const percentage = parseInt(value);
      setFormData({
        ...formData,
        no_show_fee_type: "percentage",
        no_show_fee_percentage: isNaN(percentage) ? null : percentage,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preferência de cancelamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="name" className="text-sm font-medium">
              Nome da Política: <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Flexível - 7 dias - Pré-pagamento"
              required
              disabled={loading}
              className="mt-2"
            />
          </div>

          <div>
            <Label className="text-sm font-medium mb-3 block">
              Existe um período em que o hóspede pode cancelar a reserva sem custo?
            </Label>
            <RadioGroup
              value={formData.has_free_cancellation ? "sim" : "nao"}
              onValueChange={(value) =>
                setFormData({ ...formData, has_free_cancellation: value === "sim" })
              }
              disabled={loading}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sim" id="sim" />
                <Label htmlFor="sim" className="cursor-pointer">Sim</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="nao" id="nao" />
                <Label htmlFor="nao" className="cursor-pointer">Não</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-4 p-4 border rounded-lg bg-slate-50">
            <Label className="text-sm font-medium mb-2 block">
              Especificar as condições
            </Label>

            {formData.has_free_cancellation && (
              <div>
                <Label className="text-sm mb-2 block">
                  Quanto tempo, antes da chegada, o hóspede tem para cancelar sem custo?
                </Label>
                <Select
                  value={formData.free_cancellation_deadline}
                  onValueChange={(value) =>
                    setFormData({ ...formData, free_cancellation_deadline: value })
                  }
                  disabled={loading}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREE_CANCELLATION_DEADLINES.map((deadline) => (
                      <SelectItem key={deadline} value={deadline}>
                        {deadline}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-2 block">
                  Quanto é cobrado do hóspede pelo cancelamento
                  {formData.has_free_cancellation && formData.free_cancellation_deadline
                    ? ` após o prazo de cancelamento gratuito`
                    : ""}?
                </Label>
                <Select
                  value={
                    (formData.has_free_cancellation && formData.cancellation_fee_after_deadline_type)
                      ? (formData.cancellation_fee_after_deadline_type === "first_night"
                          ? "first_night"
                          : (formData.cancellation_fee_after_deadline_percentage?.toString() || "10"))
                      : (formData.cancellation_fee_type === "first_night"
                          ? "first_night"
                          : (formData.cancellation_fee_percentage?.toString() || "10"))
                  }
                  onValueChange={(value) => {
                    if (formData.has_free_cancellation) {
                      handleAfterDeadlineFeeChange(value);
                    } else {
                      handleFeeChange(value);
                    }
                  }}
                  disabled={loading}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FEE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!formData.has_free_cancellation && (
                <div>
                  <Label className="text-sm mb-2 block">
                    Quando aplicar a taxa?
                  </Label>
                  <Select
                    value={formData.cancellation_fee_when}
                    onValueChange={(value) =>
                      setFormData({ ...formData, cancellation_fee_when: value })
                    }
                    disabled={loading}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CANCELLATION_FEE_WHEN_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {formData.has_free_cancellation && formData.free_cancellation_deadline && (
                <div>
                  <Label className="text-sm mb-2 block">
                    Quanto é cobrado do hóspede pelo cancelamento {formData.free_cancellation_deadline.replace("até ", "no ")}?
                  </Label>
                  <Select
                    value={
                      formData.cancellation_fee_type === "first_night"
                        ? "first_night"
                        : (formData.cancellation_fee_percentage?.toString() || "10")
                    }
                    onValueChange={handleFeeChange}
                    disabled={loading}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FEE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <Label className="text-sm mb-2 block">
                Quanto um hóspede deve pagar no caso de não comparecimento?
              </Label>
              <Select
                value={
                  formData.no_show_fee_type === "same_as_cancellation"
                    ? "same_as_cancellation"
                    : formData.no_show_fee_type === "first_night"
                    ? "first_night"
                    : (formData.no_show_fee_percentage?.toString() || "10")
                }
                onValueChange={handleNoShowFeeChange}
                disabled={loading}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NO_SHOW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resumo da política */}
          <Card className="p-4 bg-slate-50">
            <Label className="text-sm font-bold mb-2 block">Resumo da política</Label>
            <p className="text-sm text-muted-foreground">{policySummary}</p>
          </Card>

          {/* Pré-pagamento */}
          <div className="space-y-4 p-4 border rounded-lg">
            <Label className="text-sm font-bold mb-2 block">Pré-pagamento</Label>
            <div>
              <Label className="text-sm mb-3 block">
                Você quer cobrar os hóspedes antes que eles cheguem?
              </Label>
              <RadioGroup
                value={formData.requires_prepayment ? "sim" : "nao"}
                onValueChange={(value) =>
                  setFormData({ ...formData, requires_prepayment: value === "sim" })
                }
                disabled={loading}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sim" id="prepayment_sim" />
                  <Label htmlFor="prepayment_sim" className="cursor-pointer">Sim</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nao" id="prepayment_nao" />
                  <Label htmlFor="prepayment_nao" className="cursor-pointer">Não</Label>
                </div>
              </RadioGroup>
            </div>

            {formData.requires_prepayment && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm mb-2 block">
                      Percentual do pré-pagamento (%)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.prepayment_percentage || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          prepayment_percentage: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      disabled={loading}
                      className="mt-2"
                    />
                  </div>
                  {formData.has_free_cancellation && (
                    <div>
                      <Label className="text-sm mb-2 block">
                        Quando você quer cobrar o pré-pagamento?
                      </Label>
                      <RadioGroup
                        value={formData.prepayment_when}
                        onValueChange={(value: any) =>
                          setFormData({ ...formData, prepayment_when: value })
                        }
                        disabled={loading}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="before_free_cancellation_end" id="before_end" />
                          <Label htmlFor="before_end" className="cursor-pointer text-xs">
                            Antes do fim do período de cancelamento grátis
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="after_free_cancellation_end" id="after_end" />
                          <Label htmlFor="after_end" className="cursor-pointer text-xs">
                            Após o fim do período de cancelamento grátis
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Resumo do pré-pagamento */}
            <Card className="p-4 bg-slate-50">
              <Label className="text-sm font-bold mb-2 block">Resumo do pré-pagamento</Label>
              <p className="text-sm text-muted-foreground">{prepaymentSummary}</p>
            </Card>
          </div>

          <div>
            <Label htmlFor="description" className="text-sm font-medium">
              Descrição da Política:
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descreva a política de cancelamento..."
              disabled={loading}
              className="mt-2 min-h-[100px]"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Ativo</Label>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              disabled={loading}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : policyId ? (
                "Atualizar"
              ) : (
                "Salvar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
