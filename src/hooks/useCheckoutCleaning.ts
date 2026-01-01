import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { parseISO, format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Hook para detectar check-outs que passaram do horário e criar notificações de limpeza
 */
export const useCheckoutCleaning = () => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!selectedEstablishment?.id) return;

    const checkCheckoutsAndNotify = async () => {
      try {
        const now = new Date();
        const today = format(now, "yyyy-MM-dd");

        // Buscar reservas com check-out hoje ou passado que ainda não foram notificadas
        // e que já passaram do horário de check-out
        const { data: checkouts, error } = await supabase
          .from("reservations")
          .select(`
            *,
            rooms (*),
            financial_responsible:clients!client_id(*),
            guest:clients!guest_id(*)
          `)
          .eq("establishment_id", selectedEstablishment.id)
          .lte("checkout_date", today)
          .in("status", ["checkedout", "checkedin"])
          .neq("status", "cancelled")
          .not("room_id", "is", null);

        if (error) {
          console.error("Erro ao buscar check-outs:", error);
          return;
        }

        if (!checkouts || checkouts.length === 0) return;

        // Verificar quais check-outs já passaram do horário
        const roomsNeedingCleaning: Array<{
          roomId: string;
          roomNumber: string;
          reservationId: string;
          reservationCode: string;
          guestName: string;
          checkoutDateTime: Date;
          checkinDate?: string;
          checkoutDate?: string;
        }> = [];

        // Buscar status dos quartos para verificar quais já foram limpos
        const roomIds = checkouts
          .map(c => c.room_id)
          .filter((id): id is string => id !== null);
        
        const { data: roomsData } = await supabase
          .from("rooms")
          .select("id, status")
          .in("id", roomIds);

        const roomStatusMap = new Map<string, string>();
        roomsData?.forEach(room => {
          roomStatusMap.set(room.id, room.status);
        });

        for (const checkout of checkouts) {
          if (!checkout.room_id || !checkout.checkout_date) continue;

          // Verificar se o quarto já foi limpo (status não é "cleaning")
          const roomStatus = roomStatusMap.get(checkout.room_id);
          if (roomStatus && roomStatus !== "cleaning") {
            // Quarto já foi limpo, pular
            continue;
          }

          const checkoutDate = parseISO(checkout.checkout_date);
          let checkoutHour = 12; // Horário padrão
          let checkoutMinute = 0;

          if (checkout.checkout_time) {
            const timeParts = checkout.checkout_time.split(':');
            checkoutHour = parseInt(timeParts[0]) || 12;
            checkoutMinute = parseInt(timeParts[1]) || 0;
          }

          const checkoutDateTime = new Date(checkoutDate);
          checkoutDateTime.setHours(checkoutHour, checkoutMinute, 0, 0);

          // Se já passou do horário de check-out
          if (now >= checkoutDateTime) {
            const room = checkout.rooms;
            const guestName = checkout.guest?.full_name || 
                            checkout.financial_responsible?.full_name || 
                            checkout.guest_name || 
                            "Hóspede";

            roomsNeedingCleaning.push({
              roomId: checkout.room_id,
              roomNumber: room?.room_number || "N/A",
              reservationId: checkout.id,
              reservationCode: checkout.reservation_code || "",
              guestName,
              checkoutDateTime,
              checkinDate: checkout.checkin_date,
              checkoutDate: checkout.checkout_date,
            });
          }
        }

        if (roomsNeedingCleaning.length === 0) return;

        // Verificar se já existe notificação recente (últimas 2 horas) para evitar spam
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const { data: recentNotifications } = await supabase
          .from("notifications")
          .select("id, metadata")
          .eq("establishment_id", selectedEstablishment.id)
          .eq("type", "cleaning_required")
          .gte("created_at", twoHoursAgo.toISOString())
          .limit(10);

        // Verificar quais quartos já foram notificados recentemente
        const notifiedRoomIds = new Set<string>();
        recentNotifications?.forEach((notification) => {
          const metadata = notification.metadata as any;
          if (metadata?.room_id) {
            notifiedRoomIds.add(metadata.room_id);
          }
        });

        // Filtrar quartos que ainda não foram notificados
        const roomsToNotify = roomsNeedingCleaning.filter(
          (room) => !notifiedRoomIds.has(room.roomId)
        );

        if (roomsToNotify.length === 0) return;

        // Criar notificações para cada quarto que precisa de limpeza
        for (const room of roomsToNotify) {
          await supabase.rpc("create_notification_for_establishment", {
            p_establishment_id: selectedEstablishment.id,
            p_type: "cleaning_required",
            p_title: "Quarto Precisa de Limpeza",
            p_message: `O quarto ${room.roomNumber} precisa de limpeza após check-out da reserva ${room.reservationCode} (${room.guestName})`,
            p_priority: "high",
            p_metadata: {
              room_id: room.roomId,
              room_number: room.roomNumber,
              reservation_id: room.reservationId,
              reservation_code: room.reservationCode,
              guest_name: room.guestName,
              checkout_date: room.checkoutDate || format(room.checkoutDateTime, "yyyy-MM-dd"),
              checkout_time: format(room.checkoutDateTime, "HH:mm"),
              checkin_date: room.checkinDate,
            },
          });
        }

        // Invalidar queries para atualizar notificações
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      } catch (error) {
        console.error("Erro ao verificar check-outs para limpeza:", error);
      }
    };

    // Verificar imediatamente
    checkCheckoutsAndNotify();

    // Verificar a cada 5 minutos
    const interval = setInterval(checkCheckoutsAndNotify, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [selectedEstablishment?.id, queryClient]);
};

