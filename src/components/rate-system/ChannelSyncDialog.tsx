import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Layers } from "lucide-react";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useChannelManager } from "@/hooks/useChannelManager";

interface ChannelSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function channelTypeLabel(ch: {
  channel_type?: string | null;
  channel_manager_type?: string | null;
  name?: string | null;
}): string {
  if (ch.channel_type === "channel_manager") {
    if (ch.channel_manager_type === "bukly") return "Bukly Channel Manager";
    if (ch.channel_manager_type === "aiosell") return "Aiosell Channel Manager";
    return ch.name || "Channel Manager";
  }
  return ch.name || "Canal OTA";
}

function isChannelManager(ch: { channel_type?: string | null }): boolean {
  return ch.channel_type === "channel_manager";
}

export const ChannelSyncDialog = ({ open, onOpenChange }: ChannelSyncDialogProps) => {
  const { establishmentId: routeEstablishmentId } = useParams<{ establishmentId?: string }>();
  const establishmentId = routeEstablishmentId || getSelectedEstablishmentId();

  const queryClient = useQueryClient();
  const { channels, syncChannel, isSyncing, isLoading } = useChannelManager();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [syncStatus, setSyncStatus] = useState<Record<string, "pending" | "success" | "error">>({});

  const activeChannels = useMemo(
    () => (channels || []).filter((c: { is_active?: boolean }) => c.is_active !== false),
    [channels]
  );

  const channelManagers = useMemo(
    () => activeChannels.filter((c: { channel_type?: string | null }) => isChannelManager(c)),
    [activeChannels]
  );

  const otaDirect = useMemo(
    () => activeChannels.filter((c: { channel_type?: string | null }) => !isChannelManager(c)),
    [activeChannels]
  );

  useEffect(() => {
    if (open) {
      setSyncStatus({});
      /** Evita refetch pesado de ota_reservations (1000 linhas) + tempestade de pedidos. */
      queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
    }
  }, [open, queryClient]);

  const toggleChannel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllManagers = () => {
    setSelectedIds(channelManagers.map((c: { id: string }) => c.id));
  };

  const handleSync = async () => {
    if (selectedIds.length === 0) {
      toast.error("Selecione pelo menos um canal para sincronizar");
      return;
    }

    const est = getSelectedEstablishmentId();
    if (!est) {
      toast.error("Selecione um estabelecimento");
      return;
    }

    setSyncStatus({});

    const pending: Record<string, "pending" | "success" | "error"> = {};
    for (const id of selectedIds) pending[id] = "pending";
    setSyncStatus(pending);

    let ok = 0;
    let fail = 0;
    for (const id of selectedIds) {
      try {
        await syncChannel({ channelId: id, silent: true, skipInvalidate: true });
        setSyncStatus((prev) => ({ ...prev, [id]: "success" }));
        ok++;
      } catch {
        setSyncStatus((prev) => ({ ...prev, [id]: "error" }));
        fail++;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
    queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
    queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });

    if (fail === 0) {
      toast.success(`${ok} canal(is) sincronizado(s).`);
    } else if (ok === 0) {
      toast.error("Falha ao sincronizar os canais selecionados.");
    } else {
      toast.warning(`${ok} concluído(s), ${fail} com erro. Verifique os canais.`);
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

  const channelManagerHref = establishmentId
    ? `/${establishmentId}/channel-manager`
    : "/channel-manager";

  const renderChannelRow = (ch: {
    id: string;
    name?: string | null;
    channel_type?: string | null;
    last_sync_at?: string | null;
    sync_status?: string | null;
    sync_error?: string | null;
  }) => {
    const label = channelTypeLabel(ch);
    const isCm = isChannelManager(ch);
    return (
      <div
        key={ch.id}
        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
        onClick={() => toggleChannel(ch.id)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Checkbox
            checked={selectedIds.includes(ch.id)}
            onCheckedChange={() => toggleChannel(ch.id)}
          />
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{label}</div>
            <div className="flex flex-wrap gap-2 mt-1">
              {isCm ? (
                <Badge variant="default" className="text-xs">
                  Channel Manager
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  OTA
                </Badge>
              )}
              {ch.last_sync_at && (
                <span className="text-xs text-muted-foreground">
                  Última sync: {new Date(ch.last_sync_at).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
            {ch.sync_error && (
              <p className="text-xs text-destructive mt-1 truncate" title={ch.sync_error}>
                {ch.sync_error}
              </p>
            )}
          </div>
        </div>
        {getStatusIcon(ch.id)}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sincronizar Canais de Distribuição</DialogTitle>
          <DialogDescription>
            Envie tarifas, disponibilidade e restrições para os canais configurados. Channel Managers
            (Bukly, Aiosell) usam a integração completa; OTAs diretas seguem o fluxo padrão do PMS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
              Carregando canais…
            </div>
          ) : activeChannels.length === 0 ? (
            <div className="border rounded-lg p-6 text-center space-y-3">
              <p className="text-muted-foreground">
                Nenhum canal ativo. Configure OTAs ou Channel Managers em{" "}
                <Link
                  to={channelManagerHref}
                  className="text-primary underline font-medium"
                  onClick={() => onOpenChange(false)}
                >
                  Channel Manager
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              {channelManagers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Channel Managers
                    </Label>
                    <Button type="button" variant="outline" size="sm" onClick={selectAllManagers}>
                      Selecionar todos
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Sincronização completa (tarifas, inventário e restrições) com a API do provedor.
                  </p>
                  <div className="space-y-2">{channelManagers.map((ch) => renderChannelRow(ch))}</div>
                </div>
              )}

              {otaDirect.length > 0 && (
                <div>
                  <Label className="text-base font-semibold mb-3 block">Canais OTA (diretos)</Label>
                  <div className="space-y-2">{otaDirect.map((ch) => renderChannelRow(ch))}</div>
                </div>
              )}
            </>
          )}

          <div className="bg-muted/50 border rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Sobre a sincronização</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Período: próximos 365 dias do calendário tarifário</li>
                  <li>Channel Managers: mapeamento em Tarifas por Canal (códigos de quarto/plano)</li>
                  <li>Vários canais são processados em sequência</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSyncing}>
            Cancelar
          </Button>
          <Button
            onClick={handleSync}
            disabled={isSyncing || selectedIds.length === 0 || activeChannels.length === 0}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Sincronizando…
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Sincronizar selecionados
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
