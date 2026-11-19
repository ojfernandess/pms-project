import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, calculateNights } from "@/lib/reservationUtils";
import { Loader2, Car, Calendar, Search, Link2 } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useParkingFeeConfig } from "@/hooks/useParkingFeeConfig";
import { computeParkingFeeTotal, isParkingFeeConfigured } from "@/lib/parkingFeeConfig";
import {
  createParkingSpotReservationOnMap,
  ensureParkingFeeOnLodging,
  lodgingNightsForParking,
  lodgingReservationsForParkingLink,
  type LodgingReservationPick,
} from "@/lib/parkingMapReservation";
import { syncLinkedParkingSpotPaymentFromLodging } from "@/lib/parkingPaymentSync";
import { ReservationPaymentModal } from "@/components/reservations/ReservationPaymentModal";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

type InitialData = {
  checkin_date: string;
  checkout_date: string;
  category_id?: string;
  room_id?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: InitialData;
  onComplete?: () => void;
};

export function ParkingQuickReservationDialog({ open, onOpenChange, initialData, onComplete }: Props) {
  const queryClient = useQueryClient();
  const establishmentId = getSelectedEstablishmentId() || "";

  const [checkinDate, setCheckinDate] = useState(initialData.checkin_date);
  const [checkoutDate, setCheckoutDate] = useState(initialData.checkout_date);
  const [lodgingSearch, setLodgingSearch] = useState("");
  const [selectedLodging, setSelectedLodging] = useState<LodgingReservationPick | null>(null);
  const [saving, setSaving] = useState(false);
  const [payLodging, setPayLodging] = useState<LodgingReservationPick | null>(null);
  const [payFeeRowId, setPayFeeRowId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: category } = useQuery({
    queryKey: ["parking_map_category", initialData.category_id],
    enabled: open && !!initialData.category_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_categories")
        .select("id, name, building_id, category_kind")
        .eq("id", initialData.category_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: room } = useQuery({
    queryKey: ["parking_map_room", initialData.room_id],
    enabled: open && !!initialData.room_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_number, name")
        .eq("id", initialData.room_id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const buildingId = (category as { building_id?: string | null } | undefined)?.building_id ?? null;
  const { data: parkingConfig, isLoading: loadingConfig } = useParkingFeeConfig(buildingId, {
    strictBuildingScope: Boolean(buildingId),
  });
  const parkingActive = isParkingFeeConfigured(parkingConfig);

  const nights = useMemo(() => {
    if (selectedLodging) {
      return lodgingNightsForParking(selectedLodging);
    }
    return calculateNights(checkinDate, checkoutDate);
  }, [checkinDate, checkoutDate, selectedLodging]);

  const parkingTotal = useMemo(() => {
    if (!parkingConfig) return 0;
    const b = computeParkingFeeTotal(parkingConfig, nights);
    return b.amount * b.quantity;
  }, [parkingConfig, nights]);

  const { data: lodgingOptions = [], isLoading: loadingLodging } = useQuery({
    queryKey: ["parking_lodging_pick", establishmentId, checkinDate, checkoutDate, lodgingSearch],
    enabled: open && !!establishmentId && !!checkinDate && !!checkoutDate,
    queryFn: () =>
      lodgingReservationsForParkingLink({
        establishmentId,
        checkinDate,
        checkoutDate,
        search: lodgingSearch,
        lodgingBuildingScope: buildingId,
      }),
  });

  useEffect(() => {
    if (open) {
      setCheckinDate(initialData.checkin_date);
      setCheckoutDate(initialData.checkout_date);
      setSelectedLodging(null);
      setLodgingSearch("");
    }
  }, [open, initialData.checkin_date, initialData.checkout_date]);

  const finish = () => {
    queryClient.invalidateQueries({ queryKey: ["reservations"] });
    queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
    onComplete?.();
    onOpenChange(false);
  };

  const runCreate = async (openPaymentAfter: boolean) => {
    if (!initialData.category_id || !initialData.room_id) {
      toast.error("Selecione uma vaga específica no mapa");
      return;
    }
    if (!selectedLodging) {
      toast.error("Selecione a reserva de hospedagem para vincular");
      return;
    }
    if (!parkingActive || !parkingConfig?.serviceFeeId) {
      toast.error(
        buildingId
          ? "Configure o estacionamento deste prédio em Unidades → Serviços do prédio"
          : "Configure o estacionamento em Serviços do estabelecimento",
      );
      return;
    }
    const parkingCategoryId = initialData.category_id;
    if (
      parkingConfig.parkingCategoryId &&
      parkingConfig.parkingCategoryId !== parkingCategoryId
    ) {
      toast.error("Esta vaga não pertence ao mapa de estacionamento configurado para este escopo");
      return;
    }
    setSaving(true);
    try {
      await createParkingSpotReservationOnMap({
        lodgingReservation: selectedLodging,
        establishmentId,
        parkingCategoryId,
        parkingRoomId: initialData.room_id,
      });

      const lodgingNights = lodgingNightsForParking(selectedLodging);
      const feeRowId = await ensureParkingFeeOnLodging(selectedLodging.id, parkingConfig, lodgingNights);

      toast.success("Vaga reservada e taxa incluída na hospedagem");

      if (openPaymentAfter && feeRowId) {
        const { data: lodgingFull, error } = await supabase
          .from("reservations")
          .select("*, financial_responsible:clients!client_id(*), guest:clients!guest_id(*)")
          .eq("id", selectedLodging.id)
          .single();
        if (error) throw error;
        setPayLodging(lodgingFull as LodgingReservationPick);
        setPayFeeRowId(feeRowId);
        setPaymentOpen(true);
      } else {
        finish();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao reservar vaga");
    } finally {
      setSaving(false);
    }
  };

  const roomLabel = room?.room_number || room?.name || "Vaga";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Car className="h-5 w-5" />
              Estacionamento — {roomLabel}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {category?.name ?? "Categoria"} · Valor cobrado na reserva de hospedagem vinculada (vaga sem valor duplicado)
            </p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="park-checkin">Check-in</Label>
                <Input
                  id="park-checkin"
                  type="date"
                  className="mt-1"
                  value={checkinDate}
                  readOnly={!!selectedLodging}
                  disabled={!!selectedLodging}
                  onChange={(e) => setCheckinDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="park-checkout">Check-out</Label>
                <Input
                  id="park-checkout"
                  type="date"
                  className="mt-1"
                  min={checkinDate}
                  value={checkoutDate}
                  readOnly={!!selectedLodging}
                  disabled={!!selectedLodging}
                  onChange={(e) => setCheckoutDate(e.target.value)}
                />
              </div>
            </div>
            {selectedLodging ? (
              <p className="text-xs text-muted-foreground -mt-2">
                Datas iguais à hospedagem vinculada ({nights} diária(s) para a taxa)
              </p>
            ) : null}

            <div className="rounded-lg border bg-slate-50/80 p-3">
              <p className="text-xs text-muted-foreground">Valor (Serviços do estabelecimento)</p>
              {loadingConfig ? (
                <Loader2 className="h-4 w-4 animate-spin mt-1" />
              ) : parkingActive ? (
                <>
                  <p className="text-xl font-bold">{formatCurrency(parkingTotal)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {parkingConfig?.billingMode === "daily"
                      ? `${formatCurrency(parkingConfig.amount)} × ${nights} diária(s)`
                      : "Valor único para o período"}
                    {nights > 0 ? (
                      <span className="ml-1">
                        ({format(parseISO(checkinDate), "dd/MM", { locale: ptBR })} →{" "}
                        {format(parseISO(checkoutDate), "dd/MM", { locale: ptBR })})
                      </span>
                    ) : null}
                  </p>
                </>
              ) : (
                <p className="text-sm text-amber-800">Ative e defina o valor em Configurações → Serviços</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Link2 className="h-3.5 w-3.5" />
                Reserva de hospedagem *
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar por código ou hóspede"
                  value={lodgingSearch}
                  onChange={(e) => setLodgingSearch(e.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {loadingLodging ? (
                  <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando reservas…
                  </div>
                ) : lodgingOptions.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    Nenhuma hospedagem neste período. Ajuste as datas ou a busca.
                  </p>
                ) : (
                  lodgingOptions.map((r) => {
                    const active = selectedLodging?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm border-b last:border-0 hover:bg-muted/60 ${
                          active ? "bg-primary/10 font-medium" : ""
                        }`}
                        onClick={() => {
                          setSelectedLodging(r);
                          const cin = String(r.checkin_date).split("T")[0];
                          const cout = String(r.checkout_date).split("T")[0];
                          setCheckinDate(cin);
                          setCheckoutDate(cout);
                        }}
                      >
                        <span className="font-mono text-xs">{r.reservation_code}</span>
                        <span className="mx-2">·</span>
                        {r.guest_name || "Hóspede"}
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {format(parseISO(String(r.checkin_date).split("T")[0]), "dd/MM/yyyy")} –{" "}
                          {format(parseISO(String(r.checkout_date).split("T")[0]), "dd/MM/yyyy")}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              {selectedLodging ? (
                <p className="text-xs text-green-800">
                  Vinculado: {selectedLodging.reservation_code} — {selectedLodging.guest_name}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={saving || !parkingActive}
                onClick={() => runCreate(false)}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calendar className="h-4 w-4 mr-2" />}
                Reservar vaga
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={saving || !parkingActive}
                onClick={() => runCreate(true)}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reservar e pagar taxa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {payLodging && (
        <ReservationPaymentModal
          open={paymentOpen}
          onOpenChange={(o) => {
            setPaymentOpen(o);
            if (!o) {
              finish();
              setPayLodging(null);
              setPayFeeRowId(null);
            }
          }}
          reservation={payLodging}
          initialPaymentComponent={payFeeRowId ? `fee-${payFeeRowId}` : undefined}
          onSuccess={async () => {
            if (payLodging?.id) {
              await syncLinkedParkingSpotPaymentFromLodging(payLodging.id);
            }
            setPaymentOpen(false);
            finish();
            setPayLodging(null);
            setPayFeeRowId(null);
          }}
        />
      )}
    </>
  );
}