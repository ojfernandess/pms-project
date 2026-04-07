import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChannelManager } from "@/hooks/useChannelManager";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Globe,
  KeyRound,
  Route,
  Webhook,
  Info,
  Layers,
  Percent,
  ToggleLeft,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OTADialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  channelId?: string;
}

const OTA_OPTIONS = [
  { value: "booking", label: "Booking.com" },
  { value: "airbnb", label: "Airbnb" },
  { value: "expedia", label: "Expedia" },
  { value: "agoda", label: "Agoda" },
  { value: "tripadvisor", label: "TripAdvisor" },
  { value: "other", label: "Outro" },
];

const CHANNEL_MANAGER_OPTIONS = [
  { value: "bukly", label: "Bukly Channel Manager", type: "channel_manager" },
  { value: "aiosell", label: "Aiosell Channel Manager", type: "channel_manager" },
];

function FormSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden",
        className
      )}
    >
      <div className="border-b border-border/60 bg-muted/40 px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background border border-border/60 text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 space-y-0.5">
            <h3 className="text-sm font-semibold leading-tight text-foreground">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
            )}
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5 space-y-4">{children}</div>
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{children}</p>;
}

const aiosellReservationWebhookBase =
  typeof import.meta.env.VITE_SUPABASE_URL === "string" && import.meta.env.VITE_SUPABASE_URL
    ? `${String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, "")}/functions/v1/aiosell-reservation-webhook`
    : null;

export const OTADialog = ({ open, onOpenChange, onSuccess, channelId }: OTADialogProps) => {
  const { channels, createChannel, updateChannel, isCreating } = useChannelManager();
  const [loading, setLoading] = useState(false);
  const [webhookSecretLength, setWebhookSecretLength] = useState("48");
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [copiedWebhookSecret, setCopiedWebhookSecret] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    api_key: "",
    api_secret: "",
    is_active: true,
    sync_enabled: false,
    commission_rate: "0",
    channel_type: "ota" as "ota" | "channel_manager",
    channel_manager_type: null as string | null,
    bukly_api_url: "https://api.bukly.com.br",
    bukly_hotel_id: "",
    bukly_webhook_secret: "",
    bukly_sync_enabled: false,
    aiosell_base_url: "https://live.aiosell.com",
    aiosell_hotel_code: "",
    aiosell_inventory_path: "/api/v2/cm/update/sample-pms",
    aiosell_rates_path: "/api/v2/cm/update-rates/sample-pms",
    aiosell_list_rate_occupancy: 2,
    aiosell_bookings_list_path: "",
    aiosell_webhook_secret: "",
    aiosell_webhook_trust_hotel_only: true,
  });

  useEffect(() => {
    if (channelId && open) {
      const channel = channels.find((c: any) => c.id === channelId);
      if (channel) {
        setFormData({
          name: channel.name || "",
          api_key: channel.api_key || "",
          api_secret: channel.api_secret || "",
          is_active: channel.is_active ?? true,
          sync_enabled: channel.sync_enabled ?? false,
          commission_rate: String(channel.commission_rate || 0),
          channel_type: channel.channel_type || "ota",
          channel_manager_type: channel.channel_manager_type || null,
          bukly_api_url: channel.bukly_api_url || "https://api.bukly.com.br",
          bukly_hotel_id: channel.bukly_hotel_id || "",
          bukly_webhook_secret: channel.bukly_webhook_secret || "",
          bukly_sync_enabled: channel.bukly_sync_enabled ?? false,
          aiosell_base_url: channel.aiosell_base_url || "https://live.aiosell.com",
          aiosell_hotel_code: channel.aiosell_hotel_code || "",
          aiosell_inventory_path: channel.aiosell_inventory_path || "/api/v2/cm/update/sample-pms",
          aiosell_rates_path: channel.aiosell_rates_path || "/api/v2/cm/update-rates/sample-pms",
          aiosell_list_rate_occupancy: (() => {
            const occ = Math.floor(
              Number((channel as { aiosell_list_rate_occupancy?: unknown }).aiosell_list_rate_occupancy)
            );
            return occ >= 1 && occ <= 4 ? occ : 2;
          })(),
          aiosell_bookings_list_path:
            (channel as { aiosell_bookings_list_path?: string | null }).aiosell_bookings_list_path || "",
          aiosell_webhook_secret: channel.aiosell_webhook_secret || "",
          aiosell_webhook_trust_hotel_only: !!(channel as { aiosell_webhook_trust_hotel_only?: boolean })
            .aiosell_webhook_trust_hotel_only,
        });
      }
    } else if (!channelId && open) {
      setFormData({
        name: "",
        api_key: "",
        api_secret: "",
        is_active: true,
        sync_enabled: false,
        commission_rate: "0",
        channel_type: "ota",
        channel_manager_type: null,
        bukly_api_url: "https://api.bukly.com.br",
        bukly_hotel_id: "",
        bukly_webhook_secret: "",
        bukly_sync_enabled: false,
        aiosell_base_url: "https://live.aiosell.com",
        aiosell_hotel_code: "",
        aiosell_inventory_path: "/api/v2/cm/update/sample-pms",
        aiosell_rates_path: "/api/v2/cm/update-rates/sample-pms",
        aiosell_list_rate_occupancy: 2,
        aiosell_bookings_list_path: "",
        aiosell_webhook_secret: "",
        aiosell_webhook_trust_hotel_only: true,
      });
    }
  }, [channelId, open, channels]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...formData,
        commission_rate: parseFloat(formData.commission_rate) || 0,
        aiosell_list_rate_occupancy: Math.min(
          4,
          Math.max(1, Math.floor(Number(formData.aiosell_list_rate_occupancy)) || 2)
        ),
      };

      if (!channelId) {
        const establishmentId = localStorage.getItem("selectedEstablishmentId");
        let query = supabase
          .from("ota_channels")
          .select("id, name, establishment_id")
          .eq("name", formData.name);
        
        const { data: existingChannels } = await query;
        
        const filteredChannels = establishmentId
          ? existingChannels?.filter((c: any) => c.establishment_id === establishmentId) || []
          : existingChannels || [];
        
        if (filteredChannels.length > 0) {
          toast.error(
            `Já existe um canal OTA com o nome "${formData.name}". Por favor, escolha outro nome ou edite o canal existente.`
          );
          setLoading(false);
          return;
        }
      }

      if (channelId) {
        await updateChannel({ id: channelId, ...data });
      } else {
        await createChannel(data);
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      if (
        error?.code === "23505" ||
        error?.message?.includes("duplicate key") ||
        error?.message?.includes("unique constraint")
      ) {
        toast.error(
          `Já existe um canal OTA com o nome "${formData.name}". Por favor, escolha outro nome ou edite o canal existente.`
        );
      } else {
        toast.error(error?.message || "Erro ao salvar canal OTA. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  const generateUrlSafeSecret = (length: number): string => {
    const safeLength = Math.min(64, Math.max(32, Math.floor(length) || 48));
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bytes = new Uint32Array(safeLength);
    crypto.getRandomValues(bytes);
    let result = "";
    for (let i = 0; i < safeLength; i += 1) {
      result += charset[bytes[i] % charset.length];
    }
    return result;
  };

  const handleGenerateWebhookSecret = () => {
    const length = Number(webhookSecretLength);
    const next = generateUrlSafeSecret(length);
    setFormData((prev) => ({ ...prev, aiosell_webhook_secret: next }));
    toast.success(`Secret gerado com ${next.length} caracteres.`);
  };

  const handleCopyWebhookSecret = async () => {
    const value = formData.aiosell_webhook_secret || "";
    if (!value) {
      toast.error("Gere ou informe um secret para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopiedWebhookSecret(true);
      setTimeout(() => setCopiedWebhookSecret(false), 1500);
      toast.success("Secret copiado.");
    } catch {
      toast.error("Não foi possível copiar o secret.");
    }
  };

  const labelClass = "text-xs font-medium text-foreground sm:text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[calc(100vw-1rem)] gap-0 p-0 overflow-hidden flex flex-col",
          "sm:max-w-xl md:max-w-2xl lg:max-w-3xl",
          "max-h-[min(92vh,880px)]"
        )}
      >
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 border-b bg-muted/30 shrink-0 text-left">
          <DialogTitle className="text-lg sm:text-xl pr-8">
            {channelId ? "Editar Canal OTA" : "Novo Canal OTA"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Configure integração com OTAs ou Channel Managers. Campos obrigatórios estão marcados com *
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div className="overflow-y-auto px-4 sm:px-6 py-5 space-y-5 sm:space-y-6">
            <FormSection
              title="Identificação"
              description="Tipo de canal e fornecedor."
              icon={Layers}
            >
              <div className="space-y-2">
                <Label htmlFor="channel_type" className={labelClass}>
                  Tipo de canal *
                </Label>
            {!channelId ? (
              <Select
                value={formData.channel_type}
                onValueChange={(value) => {
                  const newData: any = { ...formData, channel_type: value as "ota" | "channel_manager" };
                  if (value === "channel_manager") {
                    newData.name = "";
                    newData.channel_manager_type = null;
                  } else {
                    newData.channel_manager_type = null;
                  }
                  setFormData(newData);
                }}
                required
              >
                    <SelectTrigger id="channel_type" className="w-full">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ota">OTA (Canal Direto)</SelectItem>
                  <SelectItem value="channel_manager">Channel Manager</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input 
                id="channel_type" 
                value={formData.channel_type === "channel_manager" ? "Channel Manager" : "OTA"} 
                disabled 
                    className="bg-muted/50"
              />
            )}
          </div>

          {formData.channel_type === "channel_manager" && (
                <div className="space-y-2">
                  <Label htmlFor="channel_manager_type" className={labelClass}>
                    Channel Manager *
                  </Label>
              {!channelId ? (
                <Select
                  value={formData.channel_manager_type || ""}
                  onValueChange={(value) => {
                        const manager = CHANNEL_MANAGER_OPTIONS.find((m) => m.value === value);
                    setFormData({ 
                      ...formData, 
                      channel_manager_type: value,
                      name: manager?.label || "",
                          ...(value === "aiosell"
                            ? { aiosell_webhook_trust_hotel_only: true }
                            : {}),
                    });
                  }}
                  required
                >
                      <SelectTrigger id="channel_manager_type" className="w-full">
                    <SelectValue placeholder="Selecione o Channel Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNEL_MANAGER_OPTIONS.map((manager) => (
                      <SelectItem key={manager.value} value={manager.value}>
                        {manager.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                    <Input id="channel_manager_type" value={formData.name} disabled className="bg-muted/50" />
              )}
            </div>
          )}

          {formData.channel_type === "ota" && (
                <div className="space-y-2">
                  <Label htmlFor="name" className={labelClass}>
                    Nome da OTA *
                  </Label>
              {!channelId ? (
                <Select
                  value={formData.name}
                  onValueChange={(value) => setFormData({ ...formData, name: value })}
                  required
                >
                      <SelectTrigger id="name" className="w-full">
                    <SelectValue placeholder="Selecione uma OTA" />
                </SelectTrigger>
                <SelectContent>
                  {OTA_OPTIONS.map((ota) => (
                    <SelectItem key={ota.value} value={ota.label}>
                      {ota.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
                    <Input id="name" value={formData.name} disabled className="bg-muted/50" />
            )}
          </div>
          )}
            </FormSection>

          {formData.channel_manager_type === "bukly" && (
            <>
                <FormSection
                  title="Integração Bukly"
                  description="URL da API e identificador do hotel no Bukly."
                  icon={Globe}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="bukly_api_url" className={labelClass}>
                        URL da API
                      </Label>
                <Input
                  id="bukly_api_url"
                  value={formData.bukly_api_url}
                  onChange={(e) => setFormData({ ...formData, bukly_api_url: e.target.value })}
                  placeholder="https://api.bukly.com.br"
                        className="font-mono text-sm"
                />
              </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="bukly_hotel_id" className={labelClass}>
                        ID do hotel no Bukly *
                      </Label>
                <Input
                  id="bukly_hotel_id"
                  value={formData.bukly_hotel_id}
                  onChange={(e) => setFormData({ ...formData, bukly_hotel_id: e.target.value })}
                        placeholder="ID fornecido pelo Bukly"
                  required={formData.channel_manager_type === "bukly"}
                />
              </div>
                  </div>
                </FormSection>

                <FormSection title="Credenciais da API" description="Chave e secret fornecidos pelo Bukly." icon={KeyRound}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="api_key" className={labelClass}>
                        API Key *
                      </Label>
            <Input
              id="api_key"
              type="password"
              value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                        placeholder="Chave da API"
                        required
                        autoComplete="off"
            />
          </div>
                    <div className="space-y-2">
                      <Label htmlFor="api_secret" className={labelClass}>
                        API Secret *
                      </Label>
            <Input
              id="api_secret"
              type="password"
              value={formData.api_secret}
              onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                        placeholder="Secret da API"
                        required
                        autoComplete="off"
            />
          </div>
                  </div>
                </FormSection>

                <FormSection title="Webhook" description="Validação opcional de chamadas recebidas do Bukly." icon={Webhook}>
                  <div className="space-y-2">
                    <Label htmlFor="bukly_webhook_secret" className={labelClass}>
                      Webhook secret
                    </Label>
              <Input
                id="bukly_webhook_secret"
                type="password"
                value={formData.bukly_webhook_secret}
                onChange={(e) => setFormData({ ...formData, bukly_webhook_secret: e.target.value })}
                      placeholder="Secret configurado no painel Bukly"
                      autoComplete="off"
                    />
                    <FieldHint>Configure o mesmo valor no painel do Bukly para validar webhooks recebidos.</FieldHint>
                  </div>
                </FormSection>

                <div className="rounded-xl border border-blue-200/80 bg-blue-50/80 dark:bg-blue-950/20 dark:border-blue-900/50 p-4 sm:p-5">
                  <div className="flex gap-3">
                    <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="space-y-2 min-w-0">
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">Sobre o Bukly</p>
                      <ul className="text-xs sm:text-sm text-blue-800/90 dark:text-blue-200/90 space-y-1.5 list-disc list-inside leading-relaxed">
                        <li>Conecta Booking.com, Expedia, Decolar e outras OTAs</li>
                        <li>Sincronização bidirecional de tarifas, disponibilidade e restrições</li>
                        <li>Reservas via webhooks</li>
                      </ul>
                      <a
                        href="https://www.bukly.com.br"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2 inline-block pt-1"
                      >
                        www.bukly.com.br
                      </a>
                    </div>
                  </div>
                </div>
              </>
            )}

            {formData.channel_manager_type === "aiosell" && (
              <>
                <FormSection
                  title="Conexão com a API"
                  description="Ambiente (sandbox ou produção) e o Hotel Code exatamente como no CM Aiosell."
                  icon={Globe}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="aiosell_base_url" className={labelClass}>
                        URL base
                      </Label>
                      <Input
                        id="aiosell_base_url"
                        value={formData.aiosell_base_url}
                        onChange={(e) => setFormData({ ...formData, aiosell_base_url: e.target.value })}
                        placeholder="https://live.aiosell.com"
                        className="font-mono text-sm"
                      />
                      <FieldHint>
                        Prefira só o domínio. Se usar <code className="text-xs">.../api/v2/cm</code>, nos
                        paths abaixo não inclua outro <code className="text-xs">/cm/</code> no início (evita
                        404 em <code className="text-xs">/cm/cm/update/...</code>).
                      </FieldHint>
                    </div>
                    <div className="space-y-2 sm:col-span-2 sm:max-w-md">
                      <Label htmlFor="aiosell_hotel_code" className={labelClass}>
                        Hotel Code *
                      </Label>
                      <Input
                        id="aiosell_hotel_code"
                        value={formData.aiosell_hotel_code}
                        onChange={(e) => setFormData({ ...formData, aiosell_hotel_code: e.target.value })}
                        placeholder="Ex.: SANDBOX-PMS"
                        required
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2 sm:max-w-md">
                      <Label htmlFor="aiosell_list_rate_occupancy" className={labelClass}>
                        Preço no CM (ocupação do tarifário ARI)
                      </Label>
                      <Select
                        value={String(formData.aiosell_list_rate_occupancy)}
                        onValueChange={(v) =>
                          setFormData({ ...formData, aiosell_list_rate_occupancy: Number(v) })
                        }
                      >
                        <SelectTrigger id="aiosell_list_rate_occupancy">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 pessoa (coluna x1)</SelectItem>
                          <SelectItem value="2">2 pessoas — preço padrão (coluna x2)</SelectItem>
                          <SelectItem value="3">3 pessoas (coluna x3)</SelectItem>
                          <SelectItem value="4">4 pessoas (coluna x4)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FieldHint>
                        O valor enviado em <code className="text-xs">rates[].rate</code> usa a mesma regra do
                        grid (base_price, adult_price e flutuações x1/x3/x4). Escolha a coluna que deve
                        corresponder ao Channel Manager.
                      </FieldHint>
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  title="Endpoints (paths)"
                  description="Caminhos dos POSTs de inventário e tarifas. Após onboarding, só o path pode mudar."
                  icon={Route}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="aiosell_inventory_path" className={labelClass}>
                        Inventário e restrições
                      </Label>
                      <Input
                        id="aiosell_inventory_path"
                        value={formData.aiosell_inventory_path}
                        onChange={(e) => setFormData({ ...formData, aiosell_inventory_path: e.target.value })}
                        placeholder="/api/v2/cm/update/sample-pms"
                        className="font-mono text-xs sm:text-sm"
                      />
                      <FieldHint>Payload mantém-se igual se a Aiosell alterar apenas o path.</FieldHint>
                    </div>
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="aiosell_rates_path" className={labelClass}>
                        Tarifas
                      </Label>
                      <Input
                        id="aiosell_rates_path"
                        value={formData.aiosell_rates_path}
                        onChange={(e) => setFormData({ ...formData, aiosell_rates_path: e.target.value })}
                        placeholder="/api/v2/cm/update-rates/sample-pms"
                        className="font-mono text-xs sm:text-sm"
                      />
                    </div>
                    <div className="space-y-2 min-w-0 sm:col-span-2">
                      <Label htmlFor="aiosell_bookings_list_path" className={labelClass}>
                        Listagem de reservas (GET, opcional)
                      </Label>
                      <Input
                        id="aiosell_bookings_list_path"
                        value={formData.aiosell_bookings_list_path}
                        onChange={(e) =>
                          setFormData({ ...formData, aiosell_bookings_list_path: e.target.value })
                        }
                        placeholder="/api/v2/cm/… (path fornecido pela Aiosell para pull)"
                        className="font-mono text-xs sm:text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Usado pelo botão «Reservas» no Channel Manager. O pedido usa Basic Auth e parâmetros{" "}
                        <code className="text-[10px]">hotelCode</code>, <code className="text-[10px]">fromDate</code>,{" "}
                        <code className="text-[10px]">toDate</code> se ainda não estiverem na URL.
                      </p>
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  title="Autenticação HTTP Basic"
                  description="Usuário e senha enviados no header Authorization."
                  icon={KeyRound}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="api_key" className={labelClass}>
                        Usuário *
                      </Label>
                      <Input
                        id="api_key"
                        type="password"
                        value={formData.api_key}
                        onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                        placeholder="ex.: aiosell"
                        required
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api_secret" className={labelClass}>
                        Senha *
                      </Label>
                      <Input
                        id="api_secret"
                        type="password"
                        value={formData.api_secret}
                        onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                        placeholder="Senha HTTP Basic"
                        required
                        autoComplete="off"
                      />
                    </div>
                  </div>
                </FormSection>

                <FormSection
                  title="Webhook de reservas"
                  description="Opcional: validação alternativa ao Basic na Edge Function."
                  icon={Webhook}
                >
                  <div className="space-y-2">
                    <Label htmlFor="aiosell_webhook_secret" className={labelClass}>
                      Secret (opcional)
                    </Label>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto_auto_auto]">
                      <Input
                        id="aiosell_webhook_secret"
                        type={showWebhookSecret ? "text" : "password"}
                        value={formData.aiosell_webhook_secret}
                        onChange={(e) => setFormData({ ...formData, aiosell_webhook_secret: e.target.value })}
                        placeholder="Header X-Aiosell-Secret deve coincidir"
                        autoComplete="off"
                        className="font-mono text-xs sm:text-sm"
                      />
                      <Select value={webhookSecretLength} onValueChange={setWebhookSecretLength}>
                        <SelectTrigger aria-label="Tamanho do secret">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="32">32 chars</SelectItem>
                          <SelectItem value="40">40 chars</SelectItem>
                          <SelectItem value="48">48 chars</SelectItem>
                          <SelectItem value="56">56 chars</SelectItem>
                          <SelectItem value="64">64 chars</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="secondary" onClick={handleGenerateWebhookSecret}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Gerar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowWebhookSecret((v) => !v)}
                      >
                        {showWebhookSecret ? (
                          <>
                            <EyeOff className="h-4 w-4 mr-2" />
                            Ocultar
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </>
                        )}
                      </Button>
                      <Button type="button" variant="outline" onClick={handleCopyWebhookSecret}>
                        {copiedWebhookSecret ? (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copiar
                          </>
                        )}
                      </Button>
                    </div>
                    <FieldHint>
                      Gere um secret URL-safe entre 32 e 64 caracteres para usar na query{" "}
                      <code className="text-xs">?secret=</code>.
                    </FieldHint>
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 mt-3">
                      <div className="space-y-1 min-w-0">
                        <Label htmlFor="aiosell_webhook_trust_hotel_only" className={labelClass}>
                          Aceitar webhook só com hotelCode (Stay OS / sem credenciais)
                        </Label>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Ligue se o CM <strong>não envia</strong> Basic, headers nem <code className="text-[10px]">?secret=</code>.
                          Depois de aplicar a migração na BD, guarde o canal. Menos seguro do que secret na URL.
                        </p>
                      </div>
                      <Switch
                        id="aiosell_webhook_trust_hotel_only"
                        className="shrink-0 mt-0.5"
                        checked={formData.aiosell_webhook_trust_hotel_only}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, aiosell_webhook_trust_hotel_only: checked })
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-2">
                      Reservas (book / modify / cancel) chegam por POST à Edge Function do projeto. Pode usar o mesmo
                      Basic Auth ou este secret.{" "}
                      <a
                        href="https://support.aiosell.com/portal/en/kb/articles/aiosell-rest-api-documentation-property-management-system-to-channel-manager"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary font-medium underline underline-offset-2"
                      >
                        Documentação Aiosell REST API
                      </a>
                    </p>
                    {aiosellReservationWebhookBase && (
                      <div className="rounded-lg border border-amber-200/90 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-800/60 p-3 mt-3 space-y-2">
                        <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
                          Base URL na Aiosell / Stay OS — sem credenciais no pedido, ative «Aceitar webhook só com
                          hotelCode» acima; senão use <code className="text-[10px]">?secret=</code> ou Basic Auth
                        </p>
                        <p className="text-xs text-amber-950/90 dark:text-amber-100/90 leading-relaxed">
                          Muitos painéis <strong>não enviam</strong> HTTP Basic no webhook — use o mesmo valor da{" "}
                          <strong>Senha</strong> (api_secret) acima:
                        </p>
                        <code className="block text-[11px] sm:text-xs break-all rounded bg-white/80 dark:bg-black/30 px-2 py-1.5 font-mono text-foreground">
                          {aiosellReservationWebhookBase}?secret=SENHA_API_IGUAL_AO_CAMPO_SENHA
                        </code>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Alternativas aceites na query: <code className="text-xs">token</code>,{" "}
                          <code className="text-xs">auth</code>, <code className="text-xs">key</code>. Opcional no
                          Supabase: secret <code className="text-xs">AIOSELL_WEBHOOK_GATE_KEY</code> e na URL{" "}
                          <code className="text-xs">?gate=…</code> com o mesmo valor.
                        </p>
                        <p className="text-[11px] text-amber-950/90 dark:text-amber-100/85 leading-relaxed border-t border-amber-200/80 dark:border-amber-800/50 pt-2 mt-2">
                          Se o painel <strong>não permitir</strong> parâmetros na URL: no Supabase → Edge Functions →
                          Secrets, defina{" "}
                          <code className="text-[10px] sm:text-xs">AIOSELL_WEBHOOK_TRUST_HOTEL_CODE_ONLY=true</code>{" "}
                          (aceita webhook só com <code className="text-xs">hotelCode</code> no JSON — menos seguro).
                          Opcional:{" "}
                          <code className="text-[10px] sm:text-xs">AIOSELL_WEBHOOK_TRUST_HOTEL_CODES</code> com a lista
                          de códigos de hotel permitidos.
              </p>
            </div>
                    )}
                  </div>
                </FormSection>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 dark:bg-slate-900/40 dark:border-slate-800 p-4 sm:p-5">
                  <div className="flex gap-3">
                    <Info className="h-5 w-5 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
                    <div className="space-y-2 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Aiosell Channel Manager</p>
                      <ul className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 space-y-1.5 list-disc list-inside leading-relaxed">
                        <li>Push de tarifas, inventário e restrições (PMS → Aiosell) com HTTP Basic</li>
                        <li>
                          Hotel Code (aqui), Room Code e Rate Plan Code (em Tarifas por canal) devem ser
                          exatamente os mesmos IDs do cadastro no Aiosell CM
                        </li>
                        <li>
                          Se a sincronização “ok” não refletir no painel, confirme path/URL e credenciais com a
                          Aiosell — os paths com /sample-pms são os da documentação oficial
                        </li>
                        <li>Após parceria, a Aiosell pode alterar URL/path; os payloads permanecem iguais</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}

            {formData.channel_type === "ota" && (
              <FormSection title="Credenciais" description="Chaves de API quando disponíveis." icon={KeyRound}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="api_key_ota" className={labelClass}>
                      API Key
                    </Label>
                    <Input
                      id="api_key_ota"
                      type="password"
                      value={formData.api_key}
                      onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                      placeholder="Opcional"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="api_secret_ota" className={labelClass}>
                      API Secret
                    </Label>
                    <Input
                      id="api_secret_ota"
                      type="password"
                      value={formData.api_secret}
                      onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                      placeholder="Opcional"
                      autoComplete="off"
                    />
                  </div>
                </div>
              </FormSection>
            )}

            <FormSection
              title="Comissão e estado"
              description="Comissão estimada e opções de ativação."
              icon={Percent}
            >
              <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="commission_rate" className={labelClass}>
                    Taxa de comissão (%)
                  </Label>
            <Input
              id="commission_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.commission_rate}
              onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
                    placeholder="0"
            />
                </div>
          </div>

              <div className="grid gap-3 sm:gap-4 pt-2 border-t border-border/60">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 sm:px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <ToggleLeft className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
                    <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer leading-snug">
                      Canal ativo
                    </Label>
                  </div>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 sm:px-4">
                  <Label htmlFor="sync_enabled" className="text-sm font-normal cursor-pointer leading-snug sm:max-w-[70%]">
                    Sincronização automática
                  </Label>
            <Switch
              id="sync_enabled"
              checked={formData.sync_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, sync_enabled: checked })}
            />
          </div>
          {formData.channel_manager_type === "bukly" && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 sm:px-4">
                    <Label htmlFor="bukly_sync_enabled" className="text-sm font-normal cursor-pointer leading-snug sm:max-w-[70%]">
                      Sincronização bidirecional Bukly
                    </Label>
              <Switch
                id="bukly_sync_enabled"
                checked={formData.bukly_sync_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, bukly_sync_enabled: checked })}
              />
            </div>
          )}
              </div>
            </FormSection>
            </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-4 border-t bg-muted/20 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || isCreating || !formData.name} className="w-full sm:w-auto min-w-[120px]">
              {loading || isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando…
                </>
              ) : channelId ? (
                "Atualizar"
              ) : (
                "Criar canal"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
