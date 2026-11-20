import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useChannelManager } from "@/hooks/useChannelManager";
import { useRateSystem } from "@/hooks/useRateSystem";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { Loader2 } from "lucide-react";

interface ChannelPricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  pricingId?: string;
}

export const ChannelPricingDialog = ({
  open,
  onOpenChange,
  onSuccess,
  pricingId,
}: ChannelPricingDialogProps) => {
  const { channels, channelPricing, createChannelPricing, updateChannelPricing, isCreating } =
    useChannelManager();

  const { ratePlans } = useRateSystem();
  const [loading, setLoading] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["room_categories", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  const [formData, setFormData] = useState({
    ota_channel_id: "",
    category_id: "",
    pricing_plan_id: "",
    price_multiplier: "1.0",
    fixed_price: "",
    start_date: "",
    end_date: "",
    is_active: true,
    channel_room_code: "",
    channel_rate_plan_code: "",
  });

  const selectedChannel = channels.find((c: any) => c.id === formData.ota_channel_id);
  const showChannelCodes =
    selectedChannel?.channel_manager_type === "aiosell" ||
    selectedChannel?.channel_manager_type === "bukly" ||
    selectedChannel?.channel_manager_type === "channex";

  const categoriesForChannel = (categories || []).filter((cat: any) => {
    const buildingId = selectedChannel?.building_id;
    if (!buildingId) return true;
    return cat.building_id === buildingId;
  });

  useEffect(() => {
    if (pricingId && open) {
      const pricing = channelPricing.find((p: any) => p.id === pricingId);
      if (pricing) {
        setFormData({
          ota_channel_id: pricing.ota_channel_id || "",
          category_id: pricing.category_id || "",
          pricing_plan_id: pricing.pricing_plan_id || "",
          price_multiplier: String(pricing.price_multiplier || 1.0),
          fixed_price: pricing.fixed_price ? String(pricing.fixed_price) : "",
          start_date: pricing.start_date || "",
          end_date: pricing.end_date || "",
          is_active: pricing.is_active ?? true,
          channel_room_code: pricing.channel_room_code || "",
          channel_rate_plan_code: pricing.channel_rate_plan_code || "",
        });
      }
    } else if (!pricingId && open) {
      setFormData({
        ota_channel_id: "",
        category_id: "",
        pricing_plan_id: "",
        price_multiplier: "1.0",
        fixed_price: "",
        start_date: "",
        end_date: "",
        is_active: true,
        channel_room_code: "",
        channel_rate_plan_code: "",
      });
    }
  }, [pricingId, open, channelPricing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data: any = {
        ota_channel_id: formData.ota_channel_id,
        category_id: formData.category_id,
        /** Obrigatório no update: sem isto o PostgREST não limpa o UUID ao passar a «Nenhum plano». */
        pricing_plan_id: formData.pricing_plan_id?.trim() || null,
        price_multiplier: parseFloat(formData.price_multiplier),
        is_active: formData.is_active,
      };
      if (formData.fixed_price) data.fixed_price = parseFloat(formData.fixed_price);
      if (formData.start_date) data.start_date = formData.start_date;
      if (formData.end_date) data.end_date = formData.end_date;
      if (formData.channel_room_code?.trim()) {
        data.channel_room_code = formData.channel_room_code.trim();
      } else {
        data.channel_room_code = null;
      }
      if (formData.channel_rate_plan_code?.trim()) {
        data.channel_rate_plan_code = formData.channel_rate_plan_code.trim();
      } else {
        data.channel_rate_plan_code = null;
      }

      if (pricingId) {
        await updateChannelPricing({ id: pricingId, ...data });
      } else {
        await createChannelPricing(data);
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {pricingId ? "Editar Tarifa por Canal" : "Nova Tarifa por Canal"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="pricing_plan_id">Plano de Tarifa</Label>
            <Select
              value={formData.pricing_plan_id || "__none__"}
              onValueChange={(value) =>
                setFormData({ ...formData, pricing_plan_id: value === "__none__" ? "" : value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um plano de tarifa (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum plano</SelectItem>
                {ratePlans
                  .filter((p: any) => p.is_active)
                  .map((plan: any) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} {plan.code ? `(${plan.code})` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ota_channel_id">Canal OTA *</Label>
              <Select
                value={formData.ota_channel_id}
                onValueChange={(value) => setFormData({ ...formData, ota_channel_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um canal" />
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

            <div>
              <Label htmlFor="category_id">Categoria *</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesForChannel.map((category: any) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="price_multiplier">Multiplicador</Label>
              <Input
                id="price_multiplier"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.price_multiplier}
                onChange={(e) => setFormData({ ...formData, price_multiplier: e.target.value })}
                placeholder="1.0 = 100%"
              />
            </div>

            <div>
              <Label htmlFor="fixed_price">Preço Fixo (opcional)</Label>
              <Input
                id="fixed_price"
                type="number"
                step="0.01"
                min="0"
                value={formData.fixed_price}
                onChange={(e) => setFormData({ ...formData, fixed_price: e.target.value })}
                placeholder="Substitui o multiplicador"
              />
            </div>

            <div>
              <Label htmlFor="start_date">Data Início (opcional)</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="end_date">Data Fim (opcional)</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                min={formData.start_date}
              />
            </div>
          </div>

          {showChannelCodes && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="channel_room_code">
                  {selectedChannel?.channel_manager_type === "aiosell"
                    ? "Room Code (Aiosell)"
                    : selectedChannel?.channel_manager_type === "channex"
                      ? "Room Type ID (Channex)"
                      : selectedChannel?.channel_manager_type === "bukly"
                        ? "Room Type Code (InvTypeCode)"
                    : "Código externo do quarto"}
                </Label>
                <Input
                  id="channel_room_code"
                  value={formData.channel_room_code}
                  onChange={(e) => setFormData({ ...formData, channel_room_code: e.target.value })}
                  placeholder={
                    selectedChannel?.channel_manager_type === "channex"
                      ? "UUID do room_type no Channex"
                      : selectedChannel?.channel_manager_type === "bukly"
                        ? "Ex.: DELUXE"
                      : "Ex.: EXECUTIVE"
                  }
                />
              </div>
              <div>
                <Label htmlFor="channel_rate_plan_code">
                  {selectedChannel?.channel_manager_type === "aiosell"
                    ? "Rate Plan Code (Aiosell)"
                    : selectedChannel?.channel_manager_type === "channex"
                      ? "Rate Plan ID (Channex)"
                      : selectedChannel?.channel_manager_type === "bukly"
                        ? "Rate Plan Code"
                    : "Código externo do plano"}
                </Label>
                <Input
                  id="channel_rate_plan_code"
                  value={formData.channel_rate_plan_code}
                  onChange={(e) =>
                    setFormData({ ...formData, channel_rate_plan_code: e.target.value })
                  }
                  placeholder={
                    selectedChannel?.channel_manager_type === "channex"
                      ? "UUID do rate_plan no Channex"
                      : selectedChannel?.channel_manager_type === "bukly"
                        ? "Ex.: BAR"
                      : "Ex.: EXECUTIVE-BAR"
                  }
                />
              </div>
            </div>
          )}

          {selectedChannel?.channel_manager_type === "aiosell" && (
            <p className="text-xs text-muted-foreground">
              Obrigatório para sincronizar: os mesmos identificadores de quarto e de plano de tarifas que no Channel
              Manager Aiosell (a API não aceita substitutos derivados do PMS). Se o mesmo par room+rate plan na
              Aiosell servir para todos os planos desta categoria, escolha «Nenhum plano» e guarde — assim uma linha
              cobre o calendário inteiro.
            </p>
          )}

          {selectedChannel?.channel_manager_type === "channex" && (
            <p className="text-xs text-muted-foreground">
              Para Channex, use os IDs remotos (UUID) de <code>room_type</code> e <code>rate_plan</code>. Esses
              valores serão usados no push ARI e no vínculo das revisões de reserva.
            </p>
          )}

          {selectedChannel?.channel_manager_type === "bukly" && (
            <p className="text-xs text-muted-foreground">
              Obrigatório para o push OTA Bukly: <code>InvTypeCode</code> (quarto) e <code>RatePlanCode</code>{" "}
              (plano) exatamente como no mapeamento Bukly. Sem esses códigos a sincronização é rejeitada.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
            <Label htmlFor="is_active">Ativa</Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || isCreating || !formData.ota_channel_id || !formData.category_id}
            >
              {loading || isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : pricingId ? (
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

