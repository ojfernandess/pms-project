import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Car } from "lucide-react";
import { toast } from "sonner";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import {
  upsertParkingFeeConfig,
  type ParkingBillingMode,
  type ParkingFeeConfig,
} from "@/lib/parkingFeeConfig";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/reservationUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  buildingId?: string | null;
  buildingName?: string;
  establishmentHasBuildings?: boolean;
  initialConfig?: ParkingFeeConfig | null;
  isLoading?: boolean;
};

export function ParkingFeeSettingCard({
  buildingId,
  buildingName,
  establishmentHasBuildings,
  initialConfig,
  isLoading,
}: Props) {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [spotCount, setSpotCount] = useState("1");
  const [billingMode, setBillingMode] = useState<ParkingBillingMode>("period");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialConfig) {
      setAmount(initialConfig.amount > 0 ? String(initialConfig.amount) : "");
      setIsActive(initialConfig.isActive);
      setBillingMode(initialConfig.billingMode);
      setSpotCount(String(Math.max(1, initialConfig.spotCount || 1)));
    } else {
      setAmount("");
      setIsActive(true);
      setBillingMode("period");
      setSpotCount("1");
    }
  }, [
    initialConfig?.id,
    initialConfig?.amount,
    initialConfig?.isActive,
    initialConfig?.billingMode,
    initialConfig?.spotCount,
  ]);

  const handleSave = async () => {
    if (!selectedEstablishment?.id) {
      toast.error("Selecione um estabelecimento");
      return;
    }
    const parsed = Number(String(amount).replace(",", "."));
    const spots = Math.floor(Number(String(spotCount).replace(",", ".")));
    if (isActive && (!Number.isFinite(parsed) || parsed <= 0)) {
      toast.error("Informe um valor válido para o estacionamento");
      return;
    }
    if (isActive && (!Number.isFinite(spots) || spots < 1)) {
      toast.error("Informe ao menos 1 vaga de estacionamento");
      return;
    }
    setSaving(true);
    try {
      await upsertParkingFeeConfig({
        establishmentId: selectedEstablishment.id,
        buildingId: buildingId ?? null,
        amount: isActive ? parsed : 0,
        isActive,
        billingMode,
        spotCount: isActive ? spots : 0,
        existingServiceRowId: initialConfig?.id ?? null,
      });
      await queryClient.invalidateQueries({ queryKey: ["parking_fee_config"] });
      await queryClient.invalidateQueries({ queryKey: ["service_fees"] });
      await queryClient.invalidateQueries({ queryKey: ["establishment_services"] });
      await queryClient.invalidateQueries({ queryKey: ["building_services"] });
      await queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      toast.success("Estacionamento salvo. Vagas sincronizadas no mapa de reservas.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar estacionamento");
    } finally {
      setSaving(false);
    }
  };

  const scopeLabel = buildingId
    ? `Prédio${buildingName ? `: ${buildingName}` : ""}`
    : establishmentHasBuildings
      ? "Hotel / estabelecimento (unidades sem prédio)"
      : "Estabelecimento";

  return (
    <Card className="p-4 border-slate-300/80 bg-slate-50/40">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-slate-200 p-2 text-slate-700">
          <Car className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h4 className="font-semibold text-slate-950">Estacionamento</h4>
            <p className="text-xs text-muted-foreground mt-1">
              {scopeLabel}. Define valor, forma de cobrança e quantidade de vagas exibidas no mapa de reservas. Ao incluir
              na cotação, a taxa aparece em Taxas da reserva (com opção de remover), como a taxa de limpeza.
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
                <Label htmlFor={`parking-active-${buildingId ?? "est"}`} className="text-sm">
                  Ativar estacionamento
                </Label>
                <Switch
                  id={`parking-active-${buildingId ?? "est"}`}
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`parking-amount-${buildingId ?? "est"}`}>
                    Valor {billingMode === "daily" ? "(por diária)" : "(por período)"}
                  </Label>
                  <Input
                    id={`parking-amount-${buildingId ?? "est"}`}
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!isActive}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Ex.: 35.00"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor={`parking-spots-${buildingId ?? "est"}`}>Quantidade de vagas</Label>
                  <Input
                    id={`parking-spots-${buildingId ?? "est"}`}
                    type="number"
                    min={1}
                    step="1"
                    disabled={!isActive}
                    value={spotCount}
                    onChange={(e) => setSpotCount(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm">Forma de cobrança</Label>
                <Select
                  value={billingMode}
                  onValueChange={(v) => setBillingMode(v as ParkingBillingMode)}
                  disabled={!isActive}
                >
                  <SelectTrigger className="mt-1 max-w-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="period">Por período (valor fixo na reserva)</SelectItem>
                    <SelectItem value="daily">Por diária (valor × noites)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {initialConfig?.isActive && initialConfig.amount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Atual: {formatCurrency(initialConfig.amount)} · {initialConfig.spotCount} vaga(s) no mapa
                </p>
              )}
              <Button type="button" onClick={handleSave} disabled={saving} variant="secondary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar estacionamento
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}