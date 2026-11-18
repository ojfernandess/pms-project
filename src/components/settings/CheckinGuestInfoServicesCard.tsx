import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Info } from "lucide-react";
import {
  CHECKIN_TEMPLATE_VARIABLES,
  type CheckinGuestInfoType,
  type CheckinGuestConfig,
  type CheckinArrivalConfig,
  type CheckinCustomConfig,
  type CheckinParkingConfig,
  type CheckinWifiConfig,
} from "@/lib/checkinCompleteVariables";
import {
  useCheckinGuestInfoServices,
  type CheckinGuestInfoServiceRow,
} from "@/hooks/useCheckinGuestInfoServices";

const TYPE_LABELS: Record<CheckinGuestInfoType, string> = {
  wifi: "Wi-Fi",
  arrival: "Instruções de chegada",
  parking: "Estacionamento",
  custom: "Personalizado",
};

const DEFAULT_NAMES: Record<CheckinGuestInfoType, string> = {
  wifi: "Wi-Fi",
  arrival: "Instruções de chegada",
  parking: "Estacionamento",
  custom: "Informação personalizada",
};

type Props =
  | { scope: "establishment"; establishmentId: string }
  | { scope: "building"; buildingId: string; buildingName?: string };

function emptyConfig(type: CheckinGuestInfoType): CheckinGuestConfig {
  switch (type) {
    case "wifi":
      return { network: "", password: "", notes: "" };
    case "arrival":
      return { title: "", body: "" };
    case "parking":
      return { fee_amount: "", instructions: "" };
    case "custom":
      return { title: "", body: "" };
  }
}

function VariablesHelp() {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
      <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
        <Info className="h-3.5 w-3.5" />
        Variáveis nos textos
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CHECKIN_TEMPLATE_VARIABLES.map((v) => (
          <Badge key={v.key} variant="secondary" className="font-mono text-[10px]">
            {`{{${v.key}}}`}
          </Badge>
        ))}
      </div>
      <p className="mt-2">
        Também aceita aliases em português, ex.: {"{{senha_quarto}}"}, {"{{localizador}}"}, {"{{nome_hospede}}"}.
      </p>
    </div>
  );
}

export function CheckinGuestInfoServicesCard(props: Props) {
  const scope =
    props.scope === "establishment"
      ? { kind: "establishment" as const, establishmentId: props.establishmentId }
      : { kind: "building" as const, buildingId: props.buildingId };

  const { items, isLoading, upsert, remove, isSaving, isRemoving } = useCheckinGuestInfoServices(scope);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CheckinGuestInfoServiceRow | null>(null);
  const [infoType, setInfoType] = useState<CheckinGuestInfoType>("wifi");
  const [name, setName] = useState(DEFAULT_NAMES.wifi);
  const [isActive, setIsActive] = useState(true);
  const [config, setConfig] = useState<CheckinGuestConfig>(emptyConfig("wifi"));

  const openCreate = () => {
    setEditing(null);
    setInfoType("wifi");
    setName(DEFAULT_NAMES.wifi);
    setIsActive(true);
    setConfig(emptyConfig("wifi"));
    setDialogOpen(true);
  };

  const openEdit = (row: CheckinGuestInfoServiceRow) => {
    setEditing(row);
    setInfoType(row.checkin_guest_info_type);
    setName(row.name);
    setIsActive(row.is_active);
    setConfig(row.checkin_guest_config || emptyConfig(row.checkin_guest_info_type));
    setDialogOpen(true);
  };

  const onTypeChange = (type: CheckinGuestInfoType) => {
    setInfoType(type);
    if (!editing) setName(DEFAULT_NAMES[type]);
    setConfig(emptyConfig(type));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await upsert({
      id: editing?.id,
      name: name.trim(),
      is_active: isActive,
      checkin_guest_info_type: infoType,
      checkin_guest_config: config,
      checkin_display_order: editing?.checkin_display_order ?? items.length,
    });
    setDialogOpen(false);
  };

  const wifi = config as CheckinWifiConfig;
  const arrival = config as CheckinArrivalConfig;
  const parking = config as CheckinParkingConfig;
  const custom = config as CheckinCustomConfig;

  return (
    <Card className="border-emerald-200/60 bg-emerald-50/30 p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Check-in concluído — informações ao hóspede</h3>
          <p className="text-sm text-muted-foreground">
            {props.scope === "building" && props.buildingName
              ? `Exibido para reservas no prédio ${props.buildingName}, além das informações do hotel.`
              : "Wi-Fi, chegada, estacionamento e textos personalizados na página após o check-in online."}
          </p>
        </div>
        <Button type="button" variant="outline" className="gap-2 shrink-0" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
          Nenhuma informação configurada. Adicione Wi-Fi, instruções de chegada ou outros blocos para o hóspede.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <CheckinGuestInfoRowTitle row={row} />
                {!row.is_active && (
                  <Badge variant="outline" className="mt-1 text-xs">
                    Inativo
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={isRemoving}
                  onClick={() => remove(row.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar informação" : "Nova informação para check-in concluído"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={infoType} onValueChange={(v) => onTypeChange(v as CheckinGuestInfoType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as CheckinGuestInfoType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Nome interno (lista no PMS)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <CheckinGuestInfoTypeFields
              infoType={infoType}
              wifi={wifi}
              arrival={arrival}
              parking={parking}
              custom={custom}
              setConfig={setConfig}
            />

            <VariablesHelp />

            <div className="flex items-center gap-2">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} id="checkin-info-active" />
              <Label htmlFor="checkin-info-active">Ativo (visível ao hóspede)</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CheckinGuestInfoRowTitle({ row }: { row: CheckinGuestInfoServiceRow }) {
  return (
    <p className="font-medium">
      <span className="text-muted-foreground">{TYPE_LABELS[row.checkin_guest_info_type]} — </span>
      {row.name}
    </p>
  );
}

function CheckinGuestInfoTypeFields(props: {
  infoType: CheckinGuestInfoType;
  wifi: CheckinWifiConfig;
  arrival: CheckinArrivalConfig;
  parking: CheckinParkingConfig;
  custom: CheckinCustomConfig;
  setConfig: (c: CheckinGuestConfig) => void;
}) {
  const { infoType, wifi, arrival, parking, custom, setConfig } = props;

  if (infoType === "wifi") {
    return (
      <>
        <div className="grid gap-2">
          <Label>Nome da rede</Label>
          <Input
            value={wifi.network || ""}
            onChange={(e) => setConfig({ ...wifi, network: e.target.value })}
            placeholder="Ex: StayInn_WiFi"
          />
        </div>
        <div className="grid gap-2">
          <Label>Senha do Wi-Fi</Label>
          <Input
            value={wifi.password || ""}
            onChange={(e) => setConfig({ ...wifi, password: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label>Texto complementar (opcional)</Label>
          <Textarea
            value={wifi.notes || ""}
            onChange={(e) => setConfig({ ...wifi, notes: e.target.value })}
            rows={3}
          />
        </div>
      </>
    );
  }

  if (infoType === "arrival") {
    return (
      <>
        <div className="grid gap-2">
          <Label>Título exibido ao hóspede</Label>
          <Input
            value={arrival.title || ""}
            onChange={(e) => setConfig({ ...arrival, title: e.target.value })}
            placeholder="Orientações de acesso"
          />
        </div>
        <div className="grid gap-2">
          <Label>Instruções</Label>
          <Textarea
            value={arrival.body || ""}
            onChange={(e) => setConfig({ ...arrival, body: e.target.value })}
            rows={5}
          />
        </div>
      </>
    );
  }

  if (infoType === "parking") {
    return (
      <>
        <div className="grid gap-2">
          <Label>Valor do estacionamento (opcional)</Label>
          <Input
            value={parking.fee_amount || ""}
            onChange={(e) => setConfig({ ...parking, fee_amount: e.target.value })}
            placeholder="Ex: R$ 35,00 por diária"
          />
        </div>
        <div className="grid gap-2">
          <Label>Instruções</Label>
          <Textarea
            value={parking.instructions || ""}
            onChange={(e) => setConfig({ ...parking, instructions: e.target.value })}
            rows={4}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid gap-2">
        <Label>Título</Label>
        <Input
          value={custom.title || ""}
          onChange={(e) => setConfig({ ...custom, title: e.target.value })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Conteúdo</Label>
        <Textarea
          value={custom.body || ""}
          onChange={(e) => setConfig({ ...custom, body: e.target.value })}
          rows={5}
        />
      </div>
    </>
  );
}