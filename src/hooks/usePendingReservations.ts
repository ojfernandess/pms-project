import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, parseISO, isAfter, isBefore, eachDayOfInterval, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logActivity } from "@/lib/activityLogger";
import { triggerEmail } from "@/lib/emailService";
import { reservationGuestContactFields } from "@/lib/reservationChannelDisplay";
import { invokeChannexReservationsSync } from "@/lib/channexReservationsSyncInvoke";

export interface Overbooking {
  reservation: any;
  conflictingReservations: any[];
  conflictDates: string[];
  availableRooms: any[];
  alternativeRooms: any[];
  categoryRooms: any[];
}

export const usePendingReservations = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  const isChannelReservation = (reservation: any): boolean => {
    const channel = String(reservation?.channel ?? "").trim().toLowerCase();
    const hasOtaPayload = Array.isArray(reservation?.ota_reservations) && reservation.ota_reservations.length > 0;
    if (hasOtaPayload) return true;
    if (!channel) {
      // Reservas importadas por integração normalmente não têm created_by.
      return reservation?.created_by == null;
    }
    if (channel === "direct") return false;
    if (["ota", "channel_manager", "channel manager", "aiosell", "bukly"].includes(channel)) return true;
    // Qualquer canal não-direto é tratado como integração externa.
    return true;
  };

  const isCounterReservation = (reservation: any): boolean => {
    return !isChannelReservation(reservation);
  };

  // Buscar novas reservas de OTA/Channel Manager (últimas 7 dias)
  const newOTAReservationsQuery = useQuery({
    queryKey: ["pending", "new-ota-reservations", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Buscar todas as reservas dos últimos 7 dias
      const { data: allReservations, error } = await supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*),
          ota_reservations (
            ota_source_channel_name,
            ota_segment,
            ota_guest_email,
            ota_guest_phone,
            ota_channels ( name )
          )
        `)
        .eq("establishment_id", establishmentId)
        .in("status", ["pending", "confirmed", "preregistration"])
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao buscar novas reservas de OTA:", error);
        return [];
      }

      // Filtrar reservas vindas de channel manager/OTA e não resolvidas
      const otaReservations = (allReservations || []).filter((reservation: any) => {
        return isChannelReservation(reservation) && reservation.pending_resolved_at === null;
      });

      return otaReservations;
    },
  });

  // Buscar novas reservas de balcão (últimas 7 dias)
  const newCounterReservationsQuery = useQuery({
    queryKey: ["pending", "new-counter-reservations", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Buscar todas as reservas dos últimos 7 dias
      const { data: allReservations, error } = await supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*),
          ota_reservations (
            ota_source_channel_name,
            ota_segment,
            ota_guest_email,
            ota_guest_phone,
            ota_channels ( name )
          )
        `)
        .eq("establishment_id", establishmentId)
        .in("status", ["pending", "confirmed", "preregistration"])
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao buscar novas reservas de balcão:", error);
        return [];
      }

      // Filtrar reservas criadas no PMS/balcão e não resolvidas
      const counterReservations = (allReservations || []).filter((reservation: any) => {
        return isCounterReservation(reservation) && reservation.pending_resolved_at === null;
      });

      return counterReservations;
    },
  });

  // Buscar hóspedes sem check-in (check-in hoje ou passado, status confirmed/pending)
  const noCheckInQuery = useQuery({
    queryKey: ["pending", "no-checkin", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const today = format(new Date(), "yyyy-MM-dd");

      const { data, error } = await supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*),
          ota_reservations (
            ota_source_channel_name,
            ota_segment,
            ota_guest_email,
            ota_guest_phone,
            ota_channels ( name )
          )
        `)
        .eq("establishment_id", establishmentId)
        .in("status", ["confirmed", "pending"])
        .lte("checkin_date", today)
        .neq("status", "checkedin")
        .is("pending_resolved_at", null)
        .order("checkin_date", { ascending: true });

      if (error) {
        console.error("Erro ao buscar hóspedes sem check-in:", error);
        return [];
      }

      return data || [];
    },
  });

  // Detectar overbookings
  const overbookingsQuery = useQuery({
    queryKey: ["pending", "overbookings", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      // Buscar todas as reservas ativas
      const { data: reservations, error: reservationsError } = await supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*),
          ota_reservations (
            ota_source_channel_name,
            ota_segment,
            ota_guest_email,
            ota_guest_phone,
            ota_channels ( name )
          )
        `)
        .eq("establishment_id", establishmentId)
        .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"]);

      if (reservationsError) {
        console.error("Erro ao buscar reservas:", reservationsError);
        return [];
      }

      if (!reservations || reservations.length === 0) return [];

      const overbookings: Overbooking[] = [];

      // Agrupar reservas por quarto
      const reservationsByRoom = new Map<string, any[]>();
      reservations.forEach((reservation: any) => {
        if (!reservation.room_id) return;
        if (!reservationsByRoom.has(reservation.room_id)) {
          reservationsByRoom.set(reservation.room_id, []);
        }
        reservationsByRoom.get(reservation.room_id)!.push(reservation);
      });

      // Verificar conflitos por quarto
      for (const [roomId, roomReservations] of reservationsByRoom.entries()) {
        if (roomReservations.length < 2) continue; // Precisa de pelo menos 2 reservas para ter conflito

        // Ordenar por data de check-in
        roomReservations.sort((a, b) => {
          const dateA = parseISO(a.checkin_date);
          const dateB = parseISO(b.checkin_date);
          return dateA.getTime() - dateB.getTime();
        });

        // Verificar conflitos entre reservas
        for (let i = 0; i < roomReservations.length; i++) {
          const reservation = roomReservations[i];
          const conflictingReservations: any[] = [];
          const conflictDates: string[] = [];

          const checkin = parseISO(reservation.checkin_date);
          const checkout = parseISO(reservation.checkout_date);

          for (let j = 0; j < roomReservations.length; j++) {
            if (i === j) continue;

            const otherReservation = roomReservations[j];
            const otherCheckin = parseISO(otherReservation.checkin_date);
            const otherCheckout = parseISO(otherReservation.checkout_date);

            // Verificar se há sobreposição
            // Conflito se: (checkin < otherCheckout) && (checkout > otherCheckin)
            if (
              isBefore(checkin, otherCheckout) &&
              isAfter(checkout, otherCheckin)
            ) {
              conflictingReservations.push(otherReservation);

              // Calcular datas de conflito
              const conflictStart = isAfter(checkin, otherCheckin) ? checkin : otherCheckin;
              const conflictEnd = isBefore(checkout, otherCheckout) ? checkout : otherCheckout;
              
              const dates = eachDayOfInterval({
                start: startOfDay(conflictStart),
                end: startOfDay(conflictEnd),
              });

              dates.forEach((date) => {
                const dateStr = format(date, "yyyy-MM-dd");
                if (!conflictDates.includes(dateStr)) {
                  conflictDates.push(dateStr);
                }
              });
            }
          }

          if (conflictingReservations.length > 0) {
            // Buscar quartos disponíveis na mesma categoria
            const categoryId = reservation.category_id || reservation.room_categories?.id;
            if (!categoryId) continue;

            const { data: categoryRooms } = await supabase
              .from("rooms")
              .select("*")
              .eq("category_id", categoryId)
              .eq("establishment_id", establishmentId)
              .in("status", ["available", "cleaning"]);

            // Filtrar quartos que não têm conflito no período
            const availableRooms = (categoryRooms || []).filter((room: any) => {
              if (room.id === roomId) return false; // Não incluir o quarto atual

              // Verificar se o quarto tem conflitos no período
              const hasConflict = reservations.some((r: any) => {
                if (r.room_id !== room.id) return false;
                if (r.id === reservation.id) return false;
                if (r.status === "cancelled") return false;

                const rCheckin = parseISO(r.checkin_date);
                const rCheckout = parseISO(r.checkout_date);

                return (
                  isBefore(rCheckin, checkout) &&
                  isAfter(rCheckout, checkin)
                );
              });

              return !hasConflict;
            });

            // Fallback: procurar quartos em outras categorias para permitir troca de quarto/categoria.
            const { data: allRooms } = await supabase
              .from("rooms")
              .select("*")
              .eq("establishment_id", establishmentId)
              .in("status", ["available", "cleaning"]);

            const alternativeRooms = (allRooms || []).filter((room: any) => {
              if (room.id === roomId) return false;
              if (room.is_blocked === true) return false;
              const hasConflict = reservations.some((r: any) => {
                if (r.room_id !== room.id) return false;
                if (r.id === reservation.id) return false;
                if (r.status === "cancelled") return false;
                const rCheckin = parseISO(r.checkin_date);
                const rCheckout = parseISO(r.checkout_date);
                return isBefore(rCheckin, checkout) && isAfter(rCheckout, checkin);
              });
              return !hasConflict;
            });

            overbookings.push({
              reservation,
              conflictingReservations,
              conflictDates,
              availableRooms,
              alternativeRooms,
              categoryRooms: categoryRooms || [],
            });
          }
        }
      }

      // Remover duplicatas e filtrar reservas não resolvidas
      const uniqueOverbookings = new Map<string, Overbooking>();
      overbookings.forEach((overbooking) => {
        if (!uniqueOverbookings.has(overbooking.reservation.id) &&
            overbooking.reservation.pending_resolved_at === null) {
          uniqueOverbookings.set(overbooking.reservation.id, overbooking);
        }
      });

      const finalOverbookings = Array.from(uniqueOverbookings.values());

      // Criar notificações e enviar e-mails para overbookings detectados
      if (finalOverbookings.length > 0 && establishmentId) {
        try {
          // Verificar quais overbookings já têm notificações criadas
          const { data: existingNotifications } = await supabase
            .from("notifications")
            .select("metadata")
            .eq("establishment_id", establishmentId)
            .eq("type", "overbooking")
            .eq("is_read", false);

          // Verificar quais overbookings já receberam e-mail (consultar email_logs)
          const reservationIds = finalOverbookings.map((o: Overbooking) => o.reservation.id);
          let emailedReservationIds = new Set<string>();
          
          if (reservationIds.length > 0) {
            try {
              const { data: existingEmails } = await supabase
                .from("email_logs")
                .select("reservation_id")
                .eq("event_type", "reservation.overbooking")
                .in("reservation_id", reservationIds)
                .eq("status", "sent");

              emailedReservationIds = new Set(
                (existingEmails || [])
                  .map((e: any) => e.reservation_id)
                  .filter(Boolean)
              );
            } catch (emailLogError) {
              console.warn("⚠️ Erro ao verificar e-mails enviados de overbooking:", emailLogError);
              // Continuar mesmo se a verificação falhar
            }
          }

          const notifiedReservationIds = new Set(
            (existingNotifications || [])
              .map((n: any) => n.metadata?.reservation_id)
              .filter(Boolean)
          );

          // Criar notificações e enviar e-mails apenas para novos overbookings
          for (const overbooking of finalOverbookings) {
            const reservationId = overbooking.reservation.id;
            
            // Se já existe notificação não lida para esta reserva, pular criação de notificação
            // Mas ainda verificar se precisa enviar e-mail
            const shouldCreateNotification = !notifiedReservationIds.has(reservationId);
            const shouldSendEmail = !emailedReservationIds.has(reservationId);

            const reservationCode = overbooking.reservation.reservation_code || "N/A";
            const guestName = overbooking.reservation.guest?.full_name || 
                             overbooking.reservation.financial_responsible?.full_name || 
                             "Hóspede";
            const roomName = overbooking.reservation.rooms?.name || 
                           overbooking.reservation.rooms?.room_number || 
                           "Quarto";
            const conflictCount = overbooking.conflictingReservations.length;
            const conflictDates = overbooking.conflictDates
              .map((date: string) => format(parseISO(date), "dd/MM/yyyy", { locale: ptBR }))
              .join(", ");

            // Criar notificação para todos os usuários do estabelecimento
            if (shouldCreateNotification) {
              const { error: notificationError } = await supabase.rpc(
                "create_notification_for_establishment",
                {
                  p_establishment_id: establishmentId,
                  p_type: "overbooking",
                  p_title: `Overbooking Detectado - Reserva ${reservationCode}`,
                  p_message: `A reserva ${reservationCode} (${guestName}) no quarto ${roomName} está em conflito com ${conflictCount} outra(s) reserva(s). Datas de conflito: ${conflictDates}.`,
                  p_priority: "urgent",
                  p_metadata: {
                    reservation_id: reservationId,
                    reservation_code: reservationCode,
                    room_id: overbooking.reservation.room_id,
                    room_name: roomName,
                    conflict_count: conflictCount,
                    conflict_dates: overbooking.conflictDates,
                    conflicting_reservation_ids: overbooking.conflictingReservations.map((r: any) => r.id),
                  },
                }
              );

              if (notificationError) {
                console.error("Erro ao criar notificação de overbooking:", notificationError);
              } else {
                console.log(`✅ Notificação de overbooking criada para reserva ${reservationCode}`);
              }
            }

            // Enviar e-mail para o hóspede
            if (shouldSendEmail) {
              try {
                // Verificar se há e-mail do hóspede ou responsável financeiro
                const guestEmail = reservationGuestContactFields(overbooking.reservation).email;
                
                if (!guestEmail) {
                  console.warn(`⚠️ Não foi possível enviar e-mail de overbooking para reserva ${reservationCode}: nenhum e-mail encontrado`);
                } else {
                  await triggerEmail('reservation.overbooking', overbooking.reservation);
                  console.log(`✅ E-mail de overbooking enviado para reserva ${reservationCode} (${guestEmail})`);
                }
              } catch (emailError) {
                console.error(`❌ Erro ao enviar e-mail de overbooking para reserva ${reservationCode}:`, emailError);
                // Não bloquear o processamento se o e-mail falhar
              }
            }
          }
        } catch (error) {
          console.error("Erro ao criar notificações e enviar e-mails de overbooking:", error);
          // Não bloquear o retorno dos overbookings se a notificação/e-mail falhar
        }
      }

      return finalOverbookings;
    },
  });

  const channexRevisionsQuery = useQuery({
    queryKey: ["pending", "channex-revisions", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return { modified: [], cancelled: [] };

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from("channex_booking_revisions" as any)
        .select(
          "id, ota_channel_id, revision_id, booking_id, unique_id, status, payload, process_status, error_message, created_at, reservation_id, reservation:reservations(id, reservation_code, checkin_date, checkout_date, guest_name, total_amount, paid_amount, pricing_plan_id, status, establishment_id)"
        )
        .eq("establishment_id", establishmentId)
        .in("status", ["modified", "cancelled"])
        .order("created_at", { ascending: false })
        .gte("created_at", sevenDaysAgo.toISOString());

      if (error) {
        console.error("Erro ao buscar revisões Channex:", error);
        return { modified: [], cancelled: [] };
      }

      const rows = (data || []) as any[];
      const isPendingOrFailed = (r: any) =>
        String(r.process_status || "pending") === "pending" ||
        String(r.process_status || "pending") === "failed";
      const cancelledByBooking = new Set(
        rows
          .filter((r) => r.status === "cancelled")
          .map((r) => String(r.booking_id || "").trim())
          .filter(Boolean)
      );
      const cancelledByUnique = new Set(
        rows
          .filter((r) => r.status === "cancelled")
          .map((r) => String(r.unique_id || "").trim())
          .filter(Boolean)
      );
      const isStaleFailedModified = (r: any) => {
        if (String(r.status) !== "modified") return false;
        const processStatus = String(r.process_status || "");
        if (processStatus !== "failed") return false;

        const bookingId = String(r.booking_id || "").trim();
        const uniqueId = String(r.unique_id || "").trim();
        if ((bookingId && cancelledByBooking.has(bookingId)) || (uniqueId && cancelledByUnique.has(uniqueId))) {
          return true;
        }

        const reservationStatus = String(r?.reservation?.status || "").toLowerCase();
        if (reservationStatus === "cancelled") return true;

        const message = String(r.error_message || "").toLowerCase();
        if (message.includes("superseded") || message.includes("already cancelled")) return true;
        return false;
      };
      return {
        modified: rows.filter((r) => r.status === "modified" && isPendingOrFailed(r) && !isStaleFailedModified(r)),
        cancelled: rows.filter((r) => r.status === "cancelled" && isPendingOrFailed(r)),
        modifiedCompleted: rows.filter((r) => r.status === "modified" && (!isPendingOrFailed(r) || isStaleFailedModified(r))),
        cancelledCompleted: rows.filter((r) => r.status === "cancelled" && !isPendingOrFailed(r)),
      };
    },
  });

  // Função para marcar pendência como resolvida
  const markPendingAsResolved = useMutation({
    mutationFn: async (reservationId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Buscar dados da reserva antes de atualizar
      const { data: reservation } = await supabase
        .from("reservations")
        .select("reservation_code")
        .eq("id", reservationId)
        .single();
      
      const { error } = await supabase
        .from("reservations")
        .update({
          pending_resolved_at: new Date().toISOString(),
          pending_resolved_by: user?.id || null,
        })
        .eq("id", reservationId);

      if (error) throw error;
      
      // Registrar log de resolução
      if (reservation) {
        try {
          await logActivity({
            actionType: "resolved",
            entityType: "pending",
            entityId: reservationId,
            entityCode: reservation.reservation_code,
            description: `Pendência da reserva ${reservation.reservation_code} resolvida`,
          });
        } catch (logError) {
          console.error("Erro ao registrar log de resolução:", logError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      toast.success("Pendência marcada como resolvida");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao marcar pendência como resolvida");
    },
  });

  const acceptChannexRevision = useMutation({
    mutationFn: async (args: { revisionId: string; channelId: string; bookingId?: string; bookingUniqueId?: string; status: "modified" | "cancelled" }) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Estabelecimento não encontrado");

      const payload = await invokeChannexReservationsSync(args.channelId, establishmentId, {
        revisionId: args.revisionId,
        bookingId: args.bookingId,
        bookingUniqueId: args.bookingUniqueId,
        // Força reprocessamento para aceitar ação manual mesmo com revisão já acked.
        forceReprocess: true,
        autoApplyLifecycle: true,
        sourceEvent: args.status === "cancelled" ? "booking_cancellation" : "booking_modification",
      });

      return payload;
    },
    onSuccess: (_data, vars) => {
      toast.success(
        vars.status === "modified"
          ? "Reserva modificada reprocessada com sucesso"
          : "Cancelamento de reserva processado com sucesso"
      );
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["ota_reservations"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao processar revisão Channex");
    },
  });

  return {
    newOTAReservations: newOTAReservationsQuery.data || [],
    newCounterReservations: newCounterReservationsQuery.data || [],
    noCheckIn: noCheckInQuery.data || [],
    overbookings: overbookingsQuery.data || [],
    channexModified: channexRevisionsQuery.data?.modified || [],
    channexCancelled: channexRevisionsQuery.data?.cancelled || [],
    channexModifiedCompleted: channexRevisionsQuery.data?.modifiedCompleted || [],
    channexCancelledCompleted: channexRevisionsQuery.data?.cancelledCompleted || [],
    isLoading:
      newOTAReservationsQuery.isLoading ||
      newCounterReservationsQuery.isLoading ||
      noCheckInQuery.isLoading ||
      overbookingsQuery.isLoading ||
      channexRevisionsQuery.isLoading,
    markPendingAsResolved: markPendingAsResolved.mutate,
    isMarkingResolved: markPendingAsResolved.isPending,
    acceptChannexRevision: acceptChannexRevision.mutate,
    isAcceptingChannexRevision: acceptChannexRevision.isPending,
    refetch: () => {
      newOTAReservationsQuery.refetch();
      newCounterReservationsQuery.refetch();
      noCheckInQuery.refetch();
      overbookingsQuery.refetch();
      channexRevisionsQuery.refetch();
    },
  };
};

