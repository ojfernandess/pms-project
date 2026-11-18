import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Loader2, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useChannelManager } from "@/hooks/useChannelManager";
import { OTADialog } from "@/components/channels/OTADialog";
import { ChannelPricingDialog } from "@/components/channels/ChannelPricingDialog";
import { SyncStatusCard } from "@/components/channels/SyncStatusCard";
import { AiosellMappingPanel } from "@/components/channels/AiosellMappingPanel";
import { ChannexMappingPanel } from "@/components/channels/ChannexMappingPanel";
import { formatDate } from "@/lib/reservationUtils";
import { formatCurrency } from "@/lib/reservationUtils";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { validateAiosellChannelForReservationsPull } from "@/lib/aiosellReservationsSyncInvoke";
import { validateChannexChannelForReservationsPull } from "@/lib/channexReservationsSyncInvoke";

const ChannelManager = () => {
  const {
    channels,
    otaReservations,
    channelPricing,
    isLoading,
    refetch,
    deleteChannel,
    deleteChannelPricing,
    syncChannel,
    isSyncing,
    syncAiosellReservations,
    isSyncingAiosellReservations,
    syncChannexReservations,
    isSyncingChannexReservations,
    syncBuklyReservations,
    isSyncingBuklyReservations,
  } = useChannelManager();

  /** Canais ativos — inativos não aparecem em «Canais OTA Configurados». */
  const activeChannels = useMemo(
    () => (channels || []).filter((c: { is_active?: boolean | null }) => c.is_active !== false),
    [channels]
  );

  const inactiveChannels = useMemo(
    () => (channels || []).filter((c: { is_active?: boolean | null }) => c.is_active === false),
    [channels]
  );

  const [otaDialogOpen, setOtaDialogOpen] = useState(false);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | undefined>();
  const [selectedPricingId, setSelectedPricingId] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"channel" | "pricing" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId || !deleteType) return;

    try {
      if (deleteType === "channel") {
        await deleteChannel(deleteId);
      } else if (deleteType === "pricing") {
        await deleteChannelPricing(deleteId);
      }
      setDeleteDialogOpen(false);
      setDeleteId(null);
      setDeleteType(null);
    } catch (error) {
      console.error(error);
    }
  };

  const openDeleteDialog = (type: "channel" | "pricing", id: string) => {
    setDeleteType(type);
    setDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const handleSync = async (channelId: string) => {
    try {
      await syncChannel(channelId);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSyncAiosellReservations = async (channelId: string) => {
    const est = getSelectedEstablishmentId();
    if (!est) {
      toast.error("Selecione um estabelecimento");
      return;
    }
    const channel = channels.find((c: { id: string }) => c.id === channelId);
    if (channel?.channel_manager_type !== "bukly") {
      const check =
        channel?.channel_manager_type === "channex"
          ? validateChannexChannelForReservationsPull(channel)
          : validateAiosellChannelForReservationsPull(channel);
      if (!check.ok) {
        toast.error(check.message);
        return;
      }
    }
    try {
      if (channel?.channel_manager_type === "channex") {
        await syncChannexReservations({ channelId, establishmentId: est });
      } else if (channel?.channel_manager_type === "bukly") {
        await syncBuklyReservations({ channelId, establishmentId: est });
      } else {
        await syncAiosellReservations({ channelId, establishmentId: est, pull: true });
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Channel Manager</h1>
          <p className="text-muted-foreground">Gerencie integrações com OTAs</p>
        </div>
      </div>

      <Tabs defaultValue="channels" className="space-y-4">
        <TabsList>
          <TabsTrigger value="channels">Canais</TabsTrigger>
          <TabsTrigger value="pricing">Tarifas por Canal</TabsTrigger>
          {channels.some(
            (c: { channel_manager_type?: string; is_active?: boolean | null }) =>
              c.channel_manager_type === "aiosell" && c.is_active !== false
          ) && (
            <TabsTrigger value="aiosell-mapping" className="flex items-center gap-1.5">
              <img src="/channel/Aiosell.jpeg" alt="Aiosell" className="h-4 w-auto rounded object-contain" />
              Mapeamento Aiosell
            </TabsTrigger>
          )}
          {channels.some(
            (c: { channel_manager_type?: string; is_active?: boolean | null }) =>
              c.channel_manager_type === "channex" && c.is_active !== false
          ) && (
            <TabsTrigger value="channex-mapping" className="flex items-center gap-1.5">
              <img src="/channel/logo_small.svg" alt="Channex" className="h-4 w-auto object-contain" />
              Mapeamento Channex
            </TabsTrigger>
          )}
          <TabsTrigger value="reservations">Reservas OTA</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Canais OTA Configurados</h3>
              <p className="text-sm text-muted-foreground">
                Gerencie as integrações com plataformas de reserva online
              </p>
            </div>
            <Button
              onClick={() => {
                setSelectedChannelId(undefined);
                setOtaDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Canal
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeChannels.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              {inactiveChannels.length > 0
                ? "Nenhum canal OTA ativo. Reative um canal inativo abaixo ou crie um novo."
                : "Nenhum canal OTA configurado"}
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {activeChannels.map((channel: any) => (
                  <SyncStatusCard
                    key={channel.id}
                    channel={channel}
                    onSync={handleSync}
                    isSyncing={isSyncing}
                    onSyncReservations={handleSyncAiosellReservations}
                    isSyncingReservations={
                      isSyncingAiosellReservations ||
                      isSyncingChannexReservations ||
                      isSyncingBuklyReservations
                    }
                  />
                ))}
              </div>
              
              {/* Informações sobre Bukly Channel Manager */}
              {activeChannels.some((c: any) => c.channel_manager_type === "bukly") && (
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <div className="flex items-start gap-4">
                    <img
                      src="/channel/Logotipo-Bukly.png"
                      alt="Bukly Channel Manager"
                      className="h-12 w-auto rounded-lg object-contain shrink-0 border border-blue-200 bg-white p-1"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-blue-900 mb-2">Bukly Channel Manager</h4>
                      <p className="text-sm text-blue-800 mb-2">
                        Integração OTA oficial (<code className="text-xs">https://pms.bukly.com</code>):
                        push de tarifas e disponibilidade em XML. Configure HotelCode, Basic Auth e os
                        códigos InvTypeCode / RatePlanCode em Tarifas por canal.
                      </p>
                      <ul className="text-sm text-blue-700 list-disc list-inside space-y-1 mb-2">
                        <li>Booking.com</li>
                        <li>Expedia Group (Expedia, Hotels.com, etc.)</li>
                        <li>Decolar.com</li>
                        <li>Airbnb e VRBO (configurável)</li>
                      </ul>
                      <p className="text-xs text-blue-600">
                        Documentação:{" "}
                        <a
                          href="https://bukly.com/pmsapidoc/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          bukly.com/pmsapidoc
                        </a>
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {activeChannels.some((c: any) => c.channel_manager_type === "aiosell") && (
                <Card className="p-4 bg-slate-50 border-slate-200">
                  <div className="flex items-start gap-4">
                    <img
                      src="/channel/Aiosell.jpeg"
                      alt="Aiosell Channel Manager"
                      className="h-12 w-auto rounded-lg object-contain shrink-0 border border-slate-200 bg-white p-1"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 mb-1">Aiosell Channel Manager</h4>
                      <p className="text-sm text-slate-800 mb-2">
                        Configure o código do hotel (sandbox ou produção), usuário e senha HTTP Basic. Use o
                        separador <strong>Mapeamento Aiosell</strong> para associar cada categoria e plano do PMS
                        aos Room Codes e Rate Plan Codes do painel Aiosell (ex. deluxe / deluxe-s-ep).
                      </p>
                      <p className="text-xs text-slate-600">
                        Documentação:{" "}
                        <a
                          href="https://support.aiosell.com/portal/en/kb/articles/aiosell-rest-api-documentation-property-management-system-to-channel-manager"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Aiosell REST API (PMS → Channel Manager)
                        </a>
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {activeChannels.some((c: any) => c.channel_manager_type === "channex") && (
                <Card className="p-4 bg-violet-50 border-violet-200">
                  <div className="flex items-start gap-4">
                    <img
                      src="/channel/logo_small.svg"
                      alt="Channex Channel Manager"
                      className="h-12 w-auto rounded-lg object-contain shrink-0 border border-violet-200 bg-white p-1"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-violet-900 mb-1">Channex Channel Manager</h4>
                      <p className="text-sm text-violet-800 mb-2">
                        Configure API Key e Property ID para enviar ARI (availability/restrictions) e receber
                        reservas via feed/webhook com ACK automático.
                      </p>
                      <p className="text-xs text-violet-700">
                        Documentação:{" "}
                        <a
                          href="https://docs.channex.io/guides/pms-integration-guide"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Channex PMS Integration Guide
                        </a>
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}

          {activeChannels.length > 0 && (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sincronização</TableHead>
                    <TableHead>Comissão</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeChannels.map((channel: any) => (
                    <TableRow key={channel.id}>
                      <TableCell className="font-medium">{channel.name}</TableCell>
                      <TableCell>
                        <Badge variant="default">Ativo</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            channel.sync_enabled
                              ? "default"
                              : "outline"
                          }
                        >
                          {channel.sync_enabled ? "Habilitada" : "Desabilitada"}
                        </Badge>
                      </TableCell>
                      <TableCell>{channel.commission_rate}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedChannelId(channel.id);
                              setOtaDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog("channel", channel.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {inactiveChannels.length > 0 && (
            <Card className="border-dashed">
              <div className="px-4 py-3 border-b">
                <h4 className="text-sm font-semibold text-muted-foreground">
                  Canais inativos ({inactiveChannels.length})
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Não aparecem na lista principal. Edite para reativar.
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inactiveChannels.map((channel: any) => (
                    <TableRow key={channel.id} className="opacity-80">
                      <TableCell className="font-medium text-muted-foreground">{channel.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Inativo</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedChannelId(channel.id);
                              setOtaDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog("channel", channel.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pricing" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSelectedPricingId(undefined);
                setPricingDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Tarifa
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : channelPricing.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma tarifa por canal configurada
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Plano de Tarifa</TableHead>
                    <TableHead>Preço/Multiplicador</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channelPricing.map((pricing: any) => (
                    <TableRow key={pricing.id}>
                      <TableCell className="font-medium">
                        {pricing.ota_channels?.name || "-"}
                      </TableCell>
                      <TableCell>{pricing.room_categories?.name || "-"}</TableCell>
                      <TableCell>
                        {pricing.pricing_plans?.name ? (
                          <Badge variant="outline">{pricing.pricing_plans.name}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {pricing.fixed_price
                          ? formatCurrency(pricing.fixed_price)
                          : `${(Number(pricing.price_multiplier) * 100).toFixed(0)}%`}
                      </TableCell>
                      <TableCell>
                        {pricing.start_date && pricing.end_date
                          ? `${formatDate(pricing.start_date)} - ${formatDate(pricing.end_date)}`
                          : "Sempre"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pricing.is_active ? "default" : "secondary"}>
                          {pricing.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedPricingId(pricing.id);
                              setPricingDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog("pricing", pricing.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="aiosell-mapping" className="space-y-4">
          <AiosellMappingPanel />
        </TabsContent>

        <TabsContent value="channex-mapping" className="space-y-4">
          <ChannexMappingPanel />
        </TabsContent>

        <TabsContent value="reservations">
          <Card>
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Reservas de OTAs</h3>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : otaReservations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma reserva de OTA encontrada
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cód. reserva OTA</TableHead>
                      <TableHead>Ref. CM</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Reserva</TableHead>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sincronizado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {otaReservations.map((otaReservation: any) => (
                      <TableRow key={otaReservation.id}>
                        <TableCell className="font-medium font-mono text-xs">
                          {otaReservation.ota_cm_booking_id || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {otaReservation.ota_reservation_code || "—"}
                        </TableCell>
                        <TableCell>{otaReservation.ota_channels?.name || "-"}</TableCell>
                        <TableCell>
                          {otaReservation.reservations?.reservation_code || "-"}
                        </TableCell>
                        <TableCell>
                          {otaReservation.ota_guest_name || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              otaReservation.sync_status === "synced"
                                ? "default"
                                : otaReservation.sync_status === "error"
                                ? "destructive"
                                : "secondary"
                            }
                          >
                            {otaReservation.sync_status === "synced"
                              ? "Sincronizado"
                              : otaReservation.sync_status === "error"
                              ? "Erro"
                              : "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {otaReservation.synced_at
                            ? formatDate(otaReservation.synced_at)
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <OTADialog
        open={otaDialogOpen}
        onOpenChange={setOtaDialogOpen}
        onSuccess={() => {
          refetch();
          setOtaDialogOpen(false);
          setSelectedChannelId(undefined);
        }}
        channelId={selectedChannelId}
      />

      <ChannelPricingDialog
        open={pricingDialogOpen}
        onOpenChange={setPricingDialogOpen}
        onSuccess={() => {
          refetch();
          setPricingDialogOpen(false);
          setSelectedPricingId(undefined);
        }}
        pricingId={selectedPricingId}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChannelManager;

