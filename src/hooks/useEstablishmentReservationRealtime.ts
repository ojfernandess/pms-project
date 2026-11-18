import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncLinkedParkingSpotPaymentFromLodging } from "@/lib/parkingPaymentSync";
import { patchReservationsInQueryCache, refreshReservationQueries } from "@/lib/reservationQuerySync";
import { netPaymentsTotal } from "@/lib/reservationUtils";

type ChannelBundle = {
  establishmentId: string;
  reservationsChannel: ReturnType<typeof supabase.channel>;
  paymentsChannel: ReturnType<typeof supabase.channel>;
};

let listenerCount = 0;
let bundle: ChannelBundle | null = null;

function teardownChannels() {
  if (!bundle) return;
  supabase.removeChannel(bundle.reservationsChannel);
  supabase.removeChannel(bundle.paymentsChannel);
  bundle = null;
}

function attachRealtime(establishmentId: string, queryClient: QueryClient) {
  if (bundle?.establishmentId === establishmentId) return;
  teardownChannels();

  const reservationsChannel = supabase
    .channel(`establishment-reservations:${establishmentId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "reservations",
        filter: `establishment_id=eq.${establishmentId}`,
      },
      () => {
        void refreshReservationQueries(queryClient);
      },
    )
    .subscribe();

  const paymentsChannel = supabase
    .channel(`establishment-payments:${establishmentId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "payments",
      },
      async (payload) => {
        if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
          const payment = payload.new as { reservation_id?: string } | null;
          const reservationId = payment?.reservation_id;
          if (reservationId) {
            const { data: payments } = await supabase
              .from("payments")
              .select("amount, notes, is_refund")
              .eq("reservation_id", reservationId);

            const totalPaid = netPaymentsTotal(payments || []);
            patchReservationsInQueryCache(queryClient, [
              { id: reservationId, patch: { paid_amount: totalPaid } },
            ]);

            try {
              const parkingSync = await syncLinkedParkingSpotPaymentFromLodging(reservationId);
              if (parkingSync.parkingReservationId) {
                patchReservationsInQueryCache(queryClient, [
                  {
                    id: parkingSync.parkingReservationId,
                    patch: { payment_status: parkingSync.payment_status },
                  },
                ]);
              }
            } catch (err) {
              console.error("useEstablishmentReservationRealtime: sync estacionamento", err);
            }
          }
        }
        await refreshReservationQueries(queryClient);
      },
    )
    .subscribe();

  bundle = { establishmentId, reservationsChannel, paymentsChannel };
}

/** Realtime compartilhado (ref-count): mapa, lista e outras telas do mesmo estabelecimento. */
export function useEstablishmentReservationRealtime(establishmentId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!establishmentId) return;

    listenerCount += 1;
    attachRealtime(establishmentId, queryClient);

    return () => {
      listenerCount = Math.max(0, listenerCount - 1);
      if (listenerCount === 0) {
        teardownChannels();
      }
    };
  }, [establishmentId, queryClient]);
}