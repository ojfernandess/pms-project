import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/reservationUtils";

interface SyncStatusCardProps {
  channel: any;
  onSync: (channelId: string) => void;
  isSyncing: boolean;
  /** Aiosell: importar reservas (GET ou payloads em lote). */
  onSyncReservations?: (channelId: string) => void;
  isSyncingReservations?: boolean;
}

export const SyncStatusCard = ({
  channel,
  onSync,
  isSyncing,
  onSyncReservations,
  isSyncingReservations,
}: SyncStatusCardProps) => {
  const getStatusIcon = () => {
    switch (channel.sync_status) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-success" />;
      case "error":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "syncing":
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = () => {
    switch (channel.sync_status) {
      case "success":
        return <Badge variant="default">Sucesso</Badge>;
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      case "syncing":
        return <Badge variant="secondary">Sincronizando...</Badge>;
      default:
        return <Badge variant="outline">Idle</Badge>;
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <h3 className="font-medium">{channel.name}</h3>
            <p className="text-sm text-muted-foreground">
              {channel.last_sync_at
                ? `Última sincronização: ${formatDate(channel.last_sync_at)}`
                : "Nunca sincronizado"}
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {channel.sync_error && (
        <div className="mb-3 p-2 bg-destructive/10 rounded text-sm text-destructive">
          {channel.sync_error}
        </div>
      )}

      {channel.channel_manager_type === "bukly" && (
        <div className="mb-3 p-2 bg-blue-50 rounded text-xs text-blue-800">
          <p className="font-semibold">Bukly Channel Manager</p>
          <p>Conecta com Booking.com, Expedia, Decolar.com e outras OTAs</p>
          {channel.bukly_sync_enabled && (
            <p className="mt-1">Sincronização bidirecional ativa</p>
          )}
        </div>
      )}

      {channel.channel_manager_type === "aiosell" && (
        <div className="mb-3 p-2 bg-slate-50 rounded text-xs text-slate-800">
          <p className="font-semibold">Aiosell Channel Manager</p>
          <p>Push de tarifas, inventário e restrições via HTTP Basic. Webhook de reservas na Edge Function.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {channel.channel_type === "channel_manager" ? (
            <span>Channel Manager</span>
          ) : (
            <span>Comissão: {channel.commission_rate}%</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSync(channel.id)}
            disabled={
              isSyncing ||
              isSyncingReservations ||
              channel.sync_status === "syncing" ||
              channel.bukly_sync_status === "syncing"
            }
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Tarifas / inventário
          </Button>
          {channel.channel_manager_type === "aiosell" && onSyncReservations && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onSyncReservations(channel.id)}
              disabled={
                isSyncing ||
                isSyncingReservations ||
                channel.sync_status === "syncing" ||
                channel.bukly_sync_status === "syncing"
              }
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reservas
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

