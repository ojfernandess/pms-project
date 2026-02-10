import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { parseISO, format, isAfter, isBefore, differenceInMinutes } from "date-fns";
import { useQueryClient, useQuery } from "@tanstack/react-query";

/**
 * Hook para detectar check-outs que passaram do horário e criar notificações de limpeza
 * Melhorado para ser mais robusto e funcional
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
        // Usar select("*") para evitar problemas com políticas RLS e sintaxe de select
        const { data, error } = await supabase
          .from("hotel_settings")
          .select("*")
          .eq("establishment_id", selectedEstablishment.id)
          .maybeSingle();
        
        if (error) {
          // Se não encontrar configurações, retornar null (usar padrão: true)
          if (error.code === "PGRST116") return null;
          // Se a coluna não existe (erro 42703), retornar null (usar padrão: true)
          if (error.code === "42703" || error.message?.includes("does not exist")) {
            console.warn("Coluna enable_cleaning_notifications não existe ainda. Execute a migration 20251210000004_add_enable_cleaning_notifications_to_hotel_settings.sql");
            return null;
          }
          console.error("Erro ao buscar configurações de limpeza:", error);
          return null;
        }
        
        // Retornar apenas os campos necessários
        if (!data) return null;
        
        return {
          enable_cleaning_notifications: data.enable_cleaning_notifications,
          checkout_time: data.checkout_time,
          timezone: data.timezone,
        };
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
    refetchInterval: 60000, // Refetch a cada minuto para pegar mudanças nas configurações
  });

  // Verificar se notificações de limpeza estão habilitadas (padrão: true se coluna não existir)
  const isCleaningNotificationsEnabled = hotelSettings?.enable_cleaning_notifications !== false;

  useEffect(() => {
    if (!selectedEstablishment?.id) return;
    
    // Se notificações de limpeza estão desativadas, não executar
    if (!isCleaningNotificationsEnabled) {
      console.log("[useCheckoutCleaning] Notificações de limpeza desativadas");
      return;
    }

    const checkCheckoutsAndNotify = async () => {
      try {
        console.log("[useCheckoutCleaning] Iniciando verificação de check-outs para limpeza...");
        
        const now = new Date();
        const today = format(now, "yyyy-MM-dd");
        
        // Não criar notificações para reservas muito antigas (mais de 7 dias)
        const sevenDaysAgo = format(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");

        // Horário padrão de checkout (12:00) se não encontrar nas configurações
        let defaultCheckoutHour = 12;
        let defaultCheckoutMinute = 0;
        let hotelTimezone = hotelSettings?.timezone || "America/Sao_Paulo";

        if (hotelSettings?.checkout_time) {
          const timeParts = hotelSettings.checkout_time.toString().split(':');
          defaultCheckoutHour = parseInt(timeParts[0]) || 12;
          defaultCheckoutMinute = parseInt(timeParts[1]) || 0;
        }

        console.log("[useCheckoutCleaning] Configurações:", {
          defaultCheckoutHour,
          defaultCheckoutMinute,
          hotelTimezone,
        });

        // Buscar reservas que precisam de verificação:
        // 1. Reservas com status "checkedout" (já fizeram checkout)
        // 2. Reservas com status "checkedin" mas que já passaram do horário de checkout
        // 3. Apenas reservas dos últimos 7 dias até hoje
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
          console.error("[useCheckoutCleaning] Erro ao buscar check-outs:", error);
          return;
        }

        if (!checkouts || checkouts.length === 0) {
          console.log("[useCheckoutCleaning] Nenhuma reserva encontrada para verificação");
          return;
        }

        console.log(`[useCheckoutCleaning] ${checkouts.length} reserva(s) encontrada(s) para verificação`);

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
        
        if (roomIds.length === 0) {
          console.log("[useCheckoutCleaning] Nenhum room_id encontrado nas reservas");
          return;
        }

        const { data: roomsData, error: roomsError } = await supabase
          .from("rooms")
          .select("id, status, room_number")
          .in("id", roomIds);

        if (roomsError) {
          console.error("[useCheckoutCleaning] Erro ao buscar status dos quartos:", roomsError);
          return;
        }

        const roomStatusMap = new Map<string, { status: string; room_number: string }>();
        roomsData?.forEach(room => {
          roomStatusMap.set(room.id, { status: room.status, room_number: room.room_number });
        });

        // Processar cada reserva
        for (const checkout of checkouts) {
          if (!checkout.room_id || !checkout.checkout_date) {
            console.warn("[useCheckoutCleaning] Reserva sem room_id ou checkout_date:", checkout.id);
            continue;
          }

          // Verificar se o quarto já foi limpo (status é "available")
          const roomData = roomStatusMap.get(checkout.room_id);
          if (roomData && roomData.status === "available") {
            // Quarto já foi limpo e está disponível, pular
            console.log(`[useCheckoutCleaning] Quarto ${roomData.room_number} já está disponível, pulando`);
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

          // Criar data/hora de checkout no timezone local (assumindo que checkout_date já está no timezone correto)
          const checkoutDateTime = new Date(checkoutDate);
          checkoutDateTime.setHours(checkoutHour, checkoutMinute, 0, 0);

          // Se a reserva ainda está "checkedin", verificar se já passou do horário de checkout
          // Se já está "checkedout", considerar que já passou
          let hasPassed = false;
          
          if (checkout.status === "checkedout") {
            // Reserva já fez checkout, considerar que passou do horário
            hasPassed = true;
            console.log(`[useCheckoutCleaning] Reserva ${checkout.reservation_code} já fez checkout`);
          } else if (checkout.status === "checkedin") {
            // Reserva ainda está checkedin, verificar se já passou do horário
            // Comparar data/hora atual com data/hora de checkout
            hasPassed = isAfter(now, checkoutDateTime) || now.getTime() >= checkoutDateTime.getTime();
            
            if (hasPassed) {
              const minutesPassed = differenceInMinutes(now, checkoutDateTime);
              console.log(`[useCheckoutCleaning] Reserva ${checkout.reservation_code} passou do horário de checkout há ${minutesPassed} minutos`);
            }
          }

          // Se já passou do horário de check-out
          if (hasPassed) {
            const room = checkout.rooms || roomData;
            const guestName = checkout.guest?.full_name || 
                            checkout.financial_responsible?.full_name || 
                            checkout.guest_name || 
                            "Hóspede";

            console.log(`[useCheckoutCleaning] Quarto precisa de limpeza:`, {
              reservationCode: checkout.reservation_code,
              roomNumber: room?.room_number || roomData?.room_number || "N/A",
              checkoutDate: checkout.checkout_date,
              checkoutTime: `${checkoutHour.toString().padStart(2, '0')}:${checkoutMinute.toString().padStart(2, '0')}`,
              guestName,
              roomStatus: roomData?.status || "unknown",
            });

            roomsNeedingCleaning.push({
              roomId: checkout.room_id,
              roomNumber: room?.room_number || roomData?.room_number || "N/A",
              reservationId: checkout.id,
              reservationCode: checkout.reservation_code || "",
              guestName,
              checkoutDateTime,
              checkinDate: checkout.checkin_date,
              checkoutDate: checkout.checkout_date,
            });
          }
        }

        if (roomsNeedingCleaning.length === 0) {
          console.log("[useCheckoutCleaning] Nenhum quarto precisa de limpeza no momento");
          return;
        }

        console.log(`[useCheckoutCleaning] ${roomsNeedingCleaning.length} quarto(s) precisa(m) de limpeza`);

        // Verificar se já existe notificação recente (últimas 2 horas) para evitar spam
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const { data: recentNotifications, error: notificationsError } = await supabase
          .from("notifications")
          .select("id, metadata")
          .eq("establishment_id", selectedEstablishment.id)
          .eq("type", "cleaning_required")
          .gte("created_at", twoHoursAgo.toISOString());

        if (notificationsError) {
          console.error("[useCheckoutCleaning] Erro ao buscar notificações recentes:", notificationsError);
          // Continuar mesmo com erro, para não bloquear a criação de notificações
        }

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

        if (roomsToNotify.length === 0) {
          console.log("[useCheckoutCleaning] Todos os quartos já foram notificados recentemente");
          return;
        }

        console.log(`[useCheckoutCleaning] Criando notificações para ${roomsToNotify.length} quarto(s)`);

        // Criar notificações para cada quarto que precisa de limpeza
        let successCount = 0;
        let errorCount = 0;

        for (const room of roomsToNotify) {
          try {
            const { error: rpcError } = await supabase.rpc("create_notification_for_establishment", {
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

            if (rpcError) {
              console.error(`[useCheckoutCleaning] Erro ao criar notificação para quarto ${room.roomNumber}:`, rpcError);
              errorCount++;
            } else {
              console.log(`[useCheckoutCleaning] Notificação criada com sucesso para quarto ${room.roomNumber}`);
              successCount++;
            }
          } catch (error) {
            console.error(`[useCheckoutCleaning] Exceção ao criar notificação para quarto ${room.roomNumber}:`, error);
            errorCount++;
          }
        }

        console.log(`[useCheckoutCleaning] Resultado: ${successCount} notificação(ões) criada(s), ${errorCount} erro(s)`);

        // Invalidar queries para atualizar notificações apenas se houver sucesso
        if (successCount > 0) {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      } catch (error) {
        console.error("[useCheckoutCleaning] Erro ao verificar check-outs para limpeza:", error);
      }
    };

    // Verificar imediatamente
    checkCheckoutsAndNotify();

    // Verificar a cada 2 minutos (reduzido de 5 para ser mais responsivo)
    const interval = setInterval(checkCheckoutsAndNotify, 2 * 60 * 1000);

    return () => {
      clearInterval(interval);
      console.log("[useCheckoutCleaning] Limpeza: intervalo cancelado");
    };
  }, [selectedEstablishment?.id, queryClient, isCleaningNotificationsEnabled, hotelSettings]);
};
