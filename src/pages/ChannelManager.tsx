import { useState } from "react";
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
import { formatDate } from "@/lib/reservationUtils";
import { formatCurrency } from "@/lib/reservationUtils";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { validateAiosellChannelForReservationsPull } from "@/lib/aiosellReservationsSyncInvoke";

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
  } = useChannelManager();

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
    const check = validateAiosellChannelForReservationsPull(channel);
    if (!check.ok) {
      toast.error(check.message);
      return;
    }
    try {
      await syncAiosellReservations({ channelId, establishmentId: est, pull: true });
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
          {channels.some((c: { channel_manager_type?: string }) => c.channel_manager_type === "aiosell") && (
            <TabsTrigger value="aiosell-mapping">Mapeamento Aiosell</TabsTrigger>
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
          ) : channels.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum canal OTA configurado
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                {channels.map((channel: any) => (
                  <SyncStatusCard
                    key={channel.id}
                    channel={channel}
                    onSync={handleSync}
                    isSyncing={isSyncing}
                    onSyncReservations={handleSyncAiosellReservations}
                    isSyncingReservations={isSyncingAiosellReservations}
                  />
                ))}
              </div>
              
              {/* Informações sobre Bukly Channel Manager */}
              {channels.some((c: any) => c.channel_manager_type === "bukly") && (
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-blue-900 mb-2">Bukly Channel Manager</h4>
                      <p className="text-sm text-blue-800 mb-2">
                        O Bukly conecta automaticamente seu PMS com múltiplas OTAs, incluindo:
                      </p>
                      <ul className="text-sm text-blue-700 list-disc list-inside space-y-1 mb-2">
                        <li>Booking.com</li>
                        <li>Expedia Group (Expedia, Hotels.com, etc.)</li>
                        <li>Decolar.com</li>
                        <li>Airbnb e VRBO (configurável)</li>
                      </ul>
                      <p className="text-xs text-blue-600">
                        Mais informações: <a href="https://www.bukly.com.br" target="_blank" rel="noopener noreferrer" className="underline">www.bukly.com.br</a>
                      </p>
                    </div>
                  </div>
                </Card>
              )}

              {channels.some((c: any) => c.channel_manager_type === "aiosell") && (
                <Card className="p-4 bg-slate-50 border-slate-200">
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900 mb-2">Aiosell Channel Manager</h4>
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
                </Card>
              )}
            </>
          )}

          {channels.length > 0 && (
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
                  {channels.map((channel: any) => (
                    <TableRow key={channel.id}>
                      <TableCell className="font-medium">{channel.name}</TableCell>
                      <TableCell>
                        <Badge variant={channel.is_active ? "default" : "secondary"}>
                          {channel.is_active ? "Ativo" : "Inativo"}
                        </Badge>
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
                      <TableHead>Código OTA</TableHead>
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
                        <TableCell className="font-medium">
                          {otaReservation.ota_reservation_code}
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

