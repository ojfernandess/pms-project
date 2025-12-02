import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useRateSystem } from "@/hooks/useRateSystem";
import { format, addDays } from "date-fns";

interface ChannelSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CHANNELS = [
  { id: "booking", name: "Booking.com", enabled: false },
  { id: "expedia", name: "Expedia", enabled: false },
  { id: "airbnb", name: "Airbnb", enabled: false },
  { id: "direct", name: "Motor Próprio", enabled: true },
];

export const ChannelSyncDialog = ({ open, onOpenChange }: ChannelSyncDialogProps) => {
  const [selectedChannels, setSelectedChannels] = useState<string[]>(["direct"]);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<Record<string, "pending" | "success" | "error">>({});
  const { ratePlans, rateCalendar } = useRateSystem();

  // Buscar canais configurados
  const { data: channels } = useQuery({
    queryKey: ["channels", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("ota_channels")
        .select("*")
        .eq("establishment_id", establishmentId)
        .eq("is_active", true);

      if (error) {
        console.error("Erro ao buscar canais:", error);
        return [];
      }
      return data || [];
    },
    enabled: open,
  });

  const toggleChannel = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  const handleSync = async () => {
    if (selectedChannels.length === 0) {
      toast.error("Selecione pelo menos um canal para sincronizar");
      return;
    }

    setSyncing(true);
    setSyncStatus({});

    try {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) {
        throw new Error("Establishment ID não encontrado");
      }

      // Simular sincronização (aqui você implementaria a lógica real de sincronização)
      for (const channelId of selectedChannels) {
        setSyncStatus((prev) => ({ ...prev, [channelId]: "pending" }));

        try {
          // TODO: Implementar lógica real de sincronização com cada canal
          // Por enquanto, simular com delay
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Buscar tarifas ativas do novo sistema tarifário para sincronizar
          const today = format(new Date(), "yyyy-MM-dd");
          const futureDate = format(addDays(new Date(), 365), "yyyy-MM-dd");
          
          const { data: ratesToSync, error: rateError } = await supabase
            .from("rate_calendar")
            .select(`
              *,
              pricing_plans (*),
              room_categories (*)
            `)
            .eq("establishment_id", establishmentId)
            .gte("date", today)
            .lte("date", futureDate)
            .order("date", { ascending: true });

          if (rateError) throw rateError;

          // Buscar também planos tarifários ativos para mapeamento
          const activePlans = ratePlans.filter(p => p.is_active);
          
          // Preparar dados para sincronização seguindo a lógica do PMS
          const syncData = {
            establishmentId,
            channelId,
            ratePlanMapping: activePlans.map(plan => ({
              internal: plan.code || plan.id,
              channel: channelId, // Mapear para ID do canal
              planId: plan.id,
              planName: plan.name,
            })),
            rates: (ratesToSync || []).map(rate => ({
              categoryId: rate.category_id,
              categoryName: rate.room_categories?.name,
              planId: rate.pricing_plan_id,
              planCode: rate.pricing_plans?.code,
              date: rate.date,
              basePrice: rate.base_price,
              adultPrice: rate.adult_price,
              childPrice: rate.child_price,
            })),
            syncDate: new Date().toISOString(),
          };

          // Aqui você faria a chamada real para a API do canal
          // Por exemplo: await syncWithBooking(syncData);
          // await syncWithExpedia(syncData);
          
          // Log da sincronização (em produção, salvaria em uma tabela de logs)
          console.log(`Sincronizando ${syncData.rates.length} tarifas para canal ${channelId}`, syncData);

          setSyncStatus((prev) => ({ ...prev, [channelId]: "success" }));
          toast.success(`Sincronização com ${CHANNELS.find(c => c.id === channelId)?.name} concluída`);
        } catch (error: any) {
          setSyncStatus((prev) => ({ ...prev, [channelId]: "error" }));
          toast.error(`Erro ao sincronizar com ${CHANNELS.find(c => c.id === channelId)?.name}: ${error.message}`);
        }
      }

      toast.success("Sincronização concluída!");
    } catch (error: any) {
      toast.error(`Erro na sincronização: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const getStatusIcon = (channelId: string) => {
    const status = syncStatus[channelId];
    if (!status) return null;

    switch (status) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "pending":
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sincronizar Canais de Distribuição</DialogTitle>
          <DialogDescription>
            Sincronize suas tarifas e disponibilidade com os canais de distribuição configurados
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label className="text-base font-semibold mb-4 block">Selecione os canais para sincronizar</Label>
            <div className="space-y-3">
              {CHANNELS.map((channel) => (
                <div
                  key={channel.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleChannel(channel.id)}
                >
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedChannels.includes(channel.id)}
                      onCheckedChange={() => toggleChannel(channel.id)}
                    />
                    <div>
                      <div className="font-medium text-gray-900">{channel.name}</div>
                      {channel.enabled ? (
                        <Badge variant="default" className="mt-1">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary" className="mt-1">Não configurado</Badge>
                      )}
                    </div>
                  </div>
                  {getStatusIcon(channel.id)}
                </div>
              ))}
            </div>
          </div>

          {channels && channels.length > 0 && (
            <div>
              <Label className="text-base font-semibold mb-4 block">Canais Configurados</Label>
              <div className="space-y-2">
                {channels.map((channel: any) => (
                  <div key={channel.id} className="p-3 border rounded-lg bg-gray-50">
                    <div className="font-medium text-gray-900">{channel.name}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      Última sincronização: {channel.last_sync ? new Date(channel.last_sync).toLocaleString("pt-BR") : "Nunca"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Informações sobre sincronização:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>As tarifas serão sincronizadas para os próximos 365 dias</li>
                  <li>Apenas planos tarifários ativos serão enviados</li>
                  <li>A sincronização pode levar alguns minutos dependendo do volume de dados</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>
            Cancelar
          </Button>
          <Button onClick={handleSync} disabled={syncing || selectedChannels.length === 0}>
            {syncing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Iniciar Sincronização
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

