import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChannelManager } from "@/hooks/useChannelManager";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
];

export const OTADialog = ({ open, onOpenChange, onSuccess, channelId }: OTADialogProps) => {
  const { channels, createChannel, updateChannel, isCreating } = useChannelManager();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    api_key: "",
    api_secret: "",
    is_active: true,
    sync_enabled: false,
    commission_rate: "0",
    channel_type: "ota" as "ota" | "channel_manager",
    channel_manager_type: null as string | null,
    // Campos específicos do Bukly
    bukly_api_url: "https://api.bukly.com.br",
    bukly_hotel_id: "",
    bukly_webhook_secret: "",
    bukly_sync_enabled: false,
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
      };

      // Verificar se já existe um canal com o mesmo nome (apenas para criação)
      if (!channelId) {
        const establishmentId = localStorage.getItem("selectedEstablishmentId");
        // Buscar canais com o mesmo nome
        let query = supabase
          .from("ota_channels")
          .select("id, name, establishment_id")
          .eq("name", formData.name);
        
        const { data: existingChannels } = await query;
        
        // Filtrar por establishment_id se disponível
        const filteredChannels = establishmentId
          ? existingChannels?.filter((c: any) => c.establishment_id === establishmentId) || []
          : existingChannels || [];
        
        if (filteredChannels.length > 0) {
          toast.error(`Já existe um canal OTA com o nome "${formData.name}". Por favor, escolha outro nome ou edite o canal existente.`);
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
      // Tratar erros específicos
      if (error?.code === "23505" || error?.message?.includes("duplicate key") || error?.message?.includes("unique constraint")) {
        toast.error(`Já existe um canal OTA com o nome "${formData.name}". Por favor, escolha outro nome ou edite o canal existente.`);
      } else {
        toast.error(error?.message || "Erro ao salvar canal OTA. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{channelId ? "Editar Canal OTA" : "Novo Canal OTA"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="channel_type">Tipo de Canal *</Label>
            {!channelId ? (
              <Select
                value={formData.channel_type}
                onValueChange={(value) => {
                  const newData: any = { ...formData, channel_type: value as "ota" | "channel_manager" };
                  if (value === "channel_manager") {
                    // Ao selecionar channel manager, resetar nome
                    newData.name = "";
                    newData.channel_manager_type = null;
                  } else {
                    newData.channel_manager_type = null;
                  }
                  setFormData(newData);
                }}
                required
              >
                <SelectTrigger>
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
              />
            )}
          </div>

          {formData.channel_type === "channel_manager" && (
            <div>
              <Label htmlFor="channel_manager_type">Channel Manager *</Label>
              {!channelId ? (
                <Select
                  value={formData.channel_manager_type || ""}
                  onValueChange={(value) => {
                    const manager = CHANNEL_MANAGER_OPTIONS.find(m => m.value === value);
                    setFormData({ 
                      ...formData, 
                      channel_manager_type: value,
                      name: manager?.label || "",
                    });
                  }}
                  required
                >
                  <SelectTrigger>
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
                <Input id="channel_manager_type" value={formData.name} disabled />
              )}
            </div>
          )}

          {formData.channel_type === "ota" && (
            <div>
              <Label htmlFor="name">Nome da OTA *</Label>
              {!channelId ? (
                <Select
                  value={formData.name}
                  onValueChange={(value) => setFormData({ ...formData, name: value })}
                  required
                >
                  <SelectTrigger>
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
              <Input id="name" value={formData.name} disabled />
            )}
          </div>
          )}

          {formData.channel_manager_type === "bukly" && (
            <>
              <div>
                <Label htmlFor="bukly_api_url">URL da API do Bukly</Label>
                <Input
                  id="bukly_api_url"
                  value={formData.bukly_api_url}
                  onChange={(e) => setFormData({ ...formData, bukly_api_url: e.target.value })}
                  placeholder="https://api.bukly.com.br"
                />
              </div>
              <div>
                <Label htmlFor="bukly_hotel_id">ID do Hotel no Bukly *</Label>
                <Input
                  id="bukly_hotel_id"
                  value={formData.bukly_hotel_id}
                  onChange={(e) => setFormData({ ...formData, bukly_hotel_id: e.target.value })}
                  placeholder="ID do hotel fornecido pelo Bukly"
                  required={formData.channel_manager_type === "bukly"}
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="api_key">API Key {formData.channel_manager_type === "bukly" ? "*" : ""}</Label>
            <Input
              id="api_key"
              type="password"
              value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              placeholder={formData.channel_manager_type === "bukly" ? "Chave da API do Bukly" : "Chave da API (opcional)"}
              required={formData.channel_manager_type === "bukly"}
            />
          </div>

          <div>
            <Label htmlFor="api_secret">API Secret {formData.channel_manager_type === "bukly" ? "*" : ""}</Label>
            <Input
              id="api_secret"
              type="password"
              value={formData.api_secret}
              onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
              placeholder={formData.channel_manager_type === "bukly" ? "Secret da API do Bukly" : "Secret da API (opcional)"}
              required={formData.channel_manager_type === "bukly"}
            />
          </div>

          {formData.channel_manager_type === "bukly" && (
            <div>
              <Label htmlFor="bukly_webhook_secret">Webhook Secret</Label>
              <Input
                id="bukly_webhook_secret"
                type="password"
                value={formData.bukly_webhook_secret}
                onChange={(e) => setFormData({ ...formData, bukly_webhook_secret: e.target.value })}
                placeholder="Secret para validar webhooks do Bukly"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Configure este secret no painel do Bukly para validar webhooks recebidos
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="commission_rate">Taxa de Comissão (%)</Label>
            <Input
              id="commission_rate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={formData.commission_rate}
              onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
              placeholder="Ex: 15.00"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active">Canal Ativo</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="sync_enabled"
              checked={formData.sync_enabled}
              onCheckedChange={(checked) => setFormData({ ...formData, sync_enabled: checked })}
            />
            <Label htmlFor="sync_enabled">Sincronização Automática</Label>
          </div>

          {formData.channel_manager_type === "bukly" && (
            <div className="flex items-center gap-2">
              <Switch
                id="bukly_sync_enabled"
                checked={formData.bukly_sync_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, bukly_sync_enabled: checked })}
              />
              <Label htmlFor="bukly_sync_enabled">Sincronização Bidirecional com Bukly</Label>
            </div>
          )}

          {formData.channel_manager_type === "bukly" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 font-semibold mb-2">Bukly Channel Manager</p>
              <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                <li>Conecta automaticamente com Booking.com, Expedia, Decolar.com e outras OTAs</li>
                <li>Sincronização bidirecional de tarifas, disponibilidade e restrições</li>
                <li>Recebe reservas automaticamente via webhooks</li>
                <li>Mais informações: <a href="https://www.bukly.com.br" target="_blank" rel="noopener noreferrer" className="underline">www.bukly.com.br</a></li>
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || isCreating || !formData.name}>
              {loading || isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : channelId ? (
                "Atualizar"
              ) : (
                "Criar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};


