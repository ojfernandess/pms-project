import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { parseISO, format } from "date-fns";
import { useQueryClient, useQuery } from "@tanstack/react-query";

/**
 * Hook para detectar check-outs que passaram do horário e criar notificações de limpeza
 */
export const useCheckoutCleaning = () => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();

  // Buscar configurações do hotel para verificar se notificações de limpeza estão ativas
  const { data: hotelSettings } = useQuery({
    queryKey: ["hotel_settings_cleaning", selectedEstablishment?.id],
    queryFn: async () => {
      if (!selectedEstablishment?.id) return null;
      
      try {
        const { data, error } = await supabase
          .from("hotel_settings")
          .select("enable_cleaning_notifications")
          .eq("establishment_id", selectedEstablishment.id)
          .single();

        if (error) {
          // Se a coluna não existe (erro 42703), retornar null (usar padrão: true)
          if (error.code === "42703" || error.message?.includes("does not exist")) {
            console.warn("Coluna enable_cleaning_notifications não existe ainda. Execute a migration 20251210000004_add_enable_cleaning_notifications_to_hotel_settings.sql");
            return null;
          }
          // Se não encontrar configurações, retornar null (usar padrão: true)
          if (error.code === "PGRST116") return null;
          console.error("Erro ao buscar configurações de limpeza:", error);
          return null;
        }
        return data;
      } catch (err: any) {
        // Se a coluna não existe, retornar null (usar padrão: true)
        if (err?.code === "42703" || err?.message?.includes("does not exist")) {
          console.warn("Coluna enable_cleaning_notifications não existe ainda. Execute a migration 20251210000004_add_enable_cleaning_notifications_to_hotel_settings.sql");
          return null;
        }
        console.error("Erro ao buscar configurações de limpeza:", err);
        return null;
      }
    },
    enabled: !!selectedEstablishment?.id,
    retry: false, // Não tentar novamente se a coluna não existir
  });

  // Verificar se notificações de limpeza estão habilitadas (padrão: true se coluna não existir)
  const isCleaningNotificationsEnabled = hotelSettings?.enable_cleaning_notifications !== false;

  useEffect(() => {
    if (!selectedEstablishment?.id) return;
    
    // Se notificações de limpeza estão desativadas, não executar
    if (!isCleaningNotificationsEnabled) return;

    const checkCheckoutsAndNotify = async () => {
      try {
        const now = new Date();
        const today = format(now, "yyyy-MM-dd");
        
        // Não criar notificações para reservas muito antigas (mais de 7 dias)
        const sevenDaysAgo = format(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

        // Buscar configurações do hotel para obter checkout_time padrão e timezone
        const { data: hotelSettings } = await supabase
          .from("hotel_settings")
          .select("checkout_time, timezone")
          .eq("establishment_id", selectedEstablishment.id)
          .single();

        // Horário padrão de checkout (12:00) se não encontrar nas configurações
        let defaultCheckoutHour = 12;
        let defaultCheckoutMinute = 0;
        let hotelTimezone = "America/Sao_Paulo";

        if (hotelSettings?.checkout_time) {
          const timeParts = hotelSettings.checkout_time.toString().split(':');
          defaultCheckoutHour = parseInt(timeParts[0]) || 12;
          defaultCheckoutMinute = parseInt(timeParts[1]) || 0;
        }

        if (hotelSettings?.timezone) {
          hotelTimezone = hotelSettings.timezone;
        }

        // Buscar reservas com check-out recente (últimos 7 dias) que ainda não foram notificadas
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
          .gte("checkout_date", sevenDaysAgo) // Apenas últimos 7 dias
          .lte("checkout_date", today) // Até hoje
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

          // Verificar se o quarto já foi limpo (status não é "cleaning" ou "dirty")
          const roomStatus = roomStatusMap.get(checkout.room_id);
          if (roomStatus && roomStatus !== "cleaning" && roomStatus !== "dirty") {
            // Quarto já foi limpo ou está disponível, pular
            continue;
          }

          const checkoutDate = parseISO(checkout.checkout_date);
          
          // Determinar horário de checkout: usar da reserva ou do hotel_settings
          let checkoutHour = defaultCheckoutHour;
          let checkoutMinute = defaultCheckoutMinute;

          if (checkout.checkout_time) {
            // Se a reserva tem checkout_time específico, usar esse
            const timeParts = checkout.checkout_time.toString().split(':');
            checkoutHour = parseInt(timeParts[0]) || defaultCheckoutHour;
            checkoutMinute = parseInt(timeParts[1]) || defaultCheckoutMinute;
          }

          // Criar data/hora de checkout no timezone do hotel
          // Usar a data de checkout e aplicar o horário
          const checkoutDateTime = new Date(checkoutDate);
          checkoutDateTime.setHours(checkoutHour, checkoutMinute, 0, 0);

          // Obter a data/hora atual no timezone do hotel para comparação
          const formatter = new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: hotelTimezone
          });

          // Obter componentes da data/hora atual e do checkout no timezone do hotel
          const nowParts = formatter.formatToParts(now);
          const checkoutParts = formatter.formatToParts(checkoutDateTime);

          // Extrair valores numéricos para comparação
          const getValue = (parts: Intl.DateTimeFormatPart[], type: string) => 
            parseInt(parts.find(p => p.type === type)?.value || '0');

          const nowYear = getValue(nowParts, 'year');
          const nowMonth = getValue(nowParts, 'month');
          const nowDay = getValue(nowParts, 'day');
          const nowHour = getValue(nowParts, 'hour');
          const nowMinute = getValue(nowParts, 'minute');

          const checkoutYear = getValue(checkoutParts, 'year');
          const checkoutMonth = getValue(checkoutParts, 'month');
          const checkoutDay = getValue(checkoutParts, 'day');
          const checkoutHourValue = getValue(checkoutParts, 'hour');
          const checkoutMinuteValue = getValue(checkoutParts, 'minute');

          // Comparar: primeiro data, depois hora
          let hasPassed = false;
          if (nowYear > checkoutYear) {
            hasPassed = true;
          } else if (nowYear === checkoutYear) {
            if (nowMonth > checkoutMonth) {
              hasPassed = true;
            } else if (nowMonth === checkoutMonth) {
              if (nowDay > checkoutDay) {
                hasPassed = true;
              } else if (nowDay === checkoutDay) {
                // Mesmo dia: comparar hora
                if (nowHour > checkoutHourValue) {
                  hasPassed = true;
                } else if (nowHour === checkoutHourValue) {
                  // Mesma hora: comparar minuto
                  if (nowMinute >= checkoutMinuteValue) {
                    hasPassed = true;
                  }
                }
              }
            }
          }

          // Se já passou do horário de check-out (considerando timezone do hotel)
          if (hasPassed) {
            const room = checkout.rooms;
            const guestName = checkout.guest?.full_name || 
                            checkout.financial_responsible?.full_name || 
                            checkout.guest_name || 
                            "Hóspede";

            // Formatar datas para log
            const nowDateStr = `${nowYear}-${nowMonth.toString().padStart(2, '0')}-${nowDay.toString().padStart(2, '0')} ${nowHour.toString().padStart(2, '0')}:${nowMinute.toString().padStart(2, '0')}`;
            const checkoutDateStr = `${checkoutYear}-${checkoutMonth.toString().padStart(2, '0')}-${checkoutDay.toString().padStart(2, '0')} ${checkoutHourValue.toString().padStart(2, '0')}:${checkoutMinuteValue.toString().padStart(2, '0')}`;

            console.log(`[useCheckoutCleaning] Check-out passou do horário:`, {
              reservationCode: checkout.reservation_code,
              roomNumber: room?.room_number,
              checkoutDate: checkout.checkout_date,
              checkoutTime: `${checkoutHour.toString().padStart(2, '0')}:${checkoutMinute.toString().padStart(2, '0')}`,
              hotelTimezone,
              nowInHotelTimezone: nowDateStr,
              checkoutInHotelTimezone: checkoutDateStr,
            });

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
  }, [selectedEstablishment?.id, queryClient, isCleaningNotificationsEnabled]);
};

