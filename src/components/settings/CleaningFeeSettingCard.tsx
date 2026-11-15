import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { upsertCleaningFeeConfig, type CleaningFeeConfig } from "@/lib/cleaningFeeConfig";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/reservationUtils";

type Props = {
  buildingId?: string | null;
  buildingName?: string;
  initialConfig?: CleaningFeeConfig | null;
  isLoading?: boolean;
};

export function CleaningFeeSettingCard({ buildingId, buildingName, initialConfig, isLoading }: Props) {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setAmount(initialConfig.amount > 0 ? String(initialConfig.amount) : "");
      setIsActive(initialConfig.isActive);
    } else {
      setAmount("");
      setIsActive(true);
    }
  }, [initialConfig?.id, initialConfig?.amount, initialConfig?.isActive]);

  const handleSave = async () => {
    if (!selectedEstablishment?.id) {
      toast.error("Selecione um estabelecimento");
      return;
    }
    const parsed = Number(String(amount).replace(",", "."));
    if (isActive && (!Number.isFinite(parsed) || parsed <= 0)) {
      toast.error("Informe um valor válido para a taxa de limpeza");
      return;
    }
    setSaving(true);
    try {
      await upsertCleaningFeeConfig({
        establishmentId: selectedEstablishment.id,
        buildingId: buildingId ?? null,
        amount: isActive ? parsed : 0,
        isActive,
        existingServiceRowId: initialConfig?.id ?? null,
      });
      await queryClient.invalidateQueries({ queryKey: ["cleaning_fee_config"] });
      await queryClient.invalidateQueries({ queryKey: ["service_fees"] });
      await queryClient.invalidateQueries({ queryKey: ["establishment_services"] });
      await queryClient.invalidateQueries({ queryKey: ["building_services"] });
      toast.success("Taxa de limpeza salva. Financeiro → Taxas atualizado.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar taxa de limpeza");
    } finally {
      setSaving(false);
    }
  };

  const scopeLabel = buildingId
    ? `Prédio${buildingName ? `: ${buildingName}` : ""}`
    : "Estabelecimento";

  return (
    <Card className="p-4 border-violet-200/80 bg-violet-50/30">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-violet-100 p-2 text-violet-700">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h4 className="font-semibold text-violet-950">Taxa de limpeza</h4>
            <p className="text-xs text-muted-foreground mt-1">
              {scopeLabel}. Ao definir valor e ativar, a taxa fica disponível em Financeiro → Taxas e na cotação de
              novas reservas.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor={`cleaning-active-${buildingId ?? "est"}`} className="text-sm">
                  Ativar taxa de limpeza
                </Label>
                <Switch
                  id={`cleaning-active-${buildingId ?? "est"}`}
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
              <div>
                <Label htmlFor={`cleaning-amount-${buildingId ?? "est"}`}>Valor (taxa única)</Label>
                <Input
                  id={`cleaning-amount-${buildingId ?? "est"}`}
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={!isActive}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Ex.: 180.00"
                  className="mt-1 max-w-xs"
                />
                {initialConfig?.isActive && initialConfig.amount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Atual: {formatCurrency(initialConfig.amount)}
                  </p>
                )}
              </div>
              <Button type="button" onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar taxa de limpeza
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}