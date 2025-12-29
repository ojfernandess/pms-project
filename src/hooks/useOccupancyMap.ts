import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, isToday, isTomorrow, parseISO, differenceInDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export type RoomOccupancyStatus = 
  | "available"      // 🟢 Disponível/Limpo
  | "occupied"       // 🔴 Ocupado
  | "dirty"          // 🟡 Sujo/Aguardando Limpeza
  | "maintenance"    // 🔵 Em Manutenção
  | "blocked"        // ⚫ Bloqueado
  | "reserved"       // 🟣 Reservado (Check-in Futuro)
  | "inspection"     // 🟠 Aguardando Inspeção
  | "dirty_priority"; // 🟤 Sujo com Prioridade

export interface RoomOccupancyData {
  id: string;
  room_number: string;
  name?: string;
  category_id: string;
  category_name: string;
  status: RoomOccupancyStatus;
  
  // Informações da reserva atual (se houver)
  reservation_id?: string;
  reservation_code?: string;
  identification_number?: number;
  guest_name?: string;
  checkin_date?: string;
  checkout_date?: string;
  checkin_time?: string;
  checkout_time?: string;
  nights_remaining?: number;
  adults?: number;
  children?: number;
  total_amount?: number;
  paid_amount?: number;
  payment_status?: string;
  reservation_status?: string;
  
  // Informações do hóspede anterior (que está saindo/fez check-out)
  previous_guest_name?: string;
  previous_checkout_date?: string;
  previous_checkout_time?: string;
  previous_reservation_code?: string;
  
  // Informações do próximo hóspede (que vai entrar)
  next_guest_name?: string;
  next_checkin_date?: string;
  next_reservation_code?: string;
  next_checkin_time?: string;
  
  // Informações de limpeza/manutenção
  last_cleaning?: string;
  cleaning_priority?: "normal" | "urgent";
  maintenance_ticket_id?: string;
  maintenance_priority?: string;
  
  // Informações adicionais
  floor?: string;
  view?: string;
  bed_type?: string;
  
  // Flags para indicar se check-in/check-out ocorreram na data selecionada
  checkin_occurred_today?: boolean;
  checkout_occurred_today?: boolean;
}

export const useOccupancyMap = (selectedDate?: Date) => {
  const { selectedEstablishment } = useEstablishment();
  const date = selectedDate || new Date();
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["occupancy_map_rooms", selectedEstablishment?.id, dateStr],
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id;
      
      if (establishmentId) {
        localStorage.setItem("selectedEstablishmentId", establishmentId);
      }
      
      // Buscar todos os quartos com suas categorias
      let roomsQuery = supabase
        .from("rooms")
        .select(`
          *,
          room_categories (*)
        `);
      
      if (establishmentId) {
        roomsQuery = roomsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: roomsData, error: roomsError } = await roomsQuery.order("room_number");

      if (roomsError) throw roomsError;

      // Buscar reservas que podem afetar o status na data selecionada
      // Buscar reservas onde a data está entre checkin e checkout (inclusive checkin, exclusivo checkout)
      // OU reservas futuras (checkin >= dateStr) para mostrar status "reserved"
      // IMPORTANTE: Fazer duas queries separadas e combinar para garantir que todas sejam encontradas
      
      // Query 1: Reservas ativas (checkin_date <= dateStr AND checkout_date >= dateStr)
      let activeReservationsQuery = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
        .lte("checkin_date", dateStr)
        .gte("checkout_date", dateStr)
        .in("status", ["pending", "confirmed", "checkedin", "checkedout", "blocked", "preregistration"])
        .neq("status", "cancelled");
      
      if (establishmentId) {
        activeReservationsQuery = activeReservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: activeReservations, error: activeError } = await activeReservationsQuery;
      
      // Query 2: Reservas futuras (checkin_date >= dateStr)
      let futureReservationsQuery = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
        .gte("checkin_date", dateStr)
        .in("status", ["pending", "confirmed", "checkedin", "checkedout", "blocked", "preregistration"])
        .neq("status", "cancelled");
      
      if (establishmentId) {
        futureReservationsQuery = futureReservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: futureReservations, error: futureReservationsError } = await futureReservationsQuery;
      
      // Combinar resultados, removendo duplicatas
      const reservationMap = new Map();
      [...(activeReservations || []), ...(futureReservations || [])].forEach((res) => {
        if (!reservationMap.has(res.id)) {
          reservationMap.set(res.id, res);
        }
      });
      const reservations = Array.from(reservationMap.values());
      
      const reservationsError = activeError || futureReservationsError;

      if (reservationsError) {
        console.error("Erro ao buscar reservas:", reservationsError);
        throw reservationsError;
      }

      // Buscar reservas de check-out na data selecionada (para determinar status "dirty" e identificar check-outs)
      // IMPORTANTE: Buscar check-outs que já ocorreram (status checkedout) e check-ins que estão saindo na data selecionada
      let checkoutReservationsQuery = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*)
        `)
        .eq("checkout_date", dateStr)
        .in("status", ["checkedin", "checkedout"])
        .neq("status", "cancelled"); // Excluir canceladas
      
      if (establishmentId) {
        checkoutReservationsQuery = checkoutReservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: checkoutReservations, error: checkoutError } = await checkoutReservationsQuery;
      
      if (checkoutError) {
        console.error("Erro ao buscar check-outs:", checkoutError);
      }

      // Buscar reservas de check-in na data selecionada (para identificar check-ins que ocorreram)
      let checkinReservationsQuery = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*)
        `)
        .eq("checkin_date", dateStr)
        .in("status", ["checkedin", "checkedout"])
        .neq("status", "cancelled"); // Excluir canceladas
      
      if (establishmentId) {
        checkinReservationsQuery = checkinReservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: checkinReservations, error: checkinError } = await checkinReservationsQuery;
      
      if (checkinError) {
        console.error("Erro ao buscar check-ins:", checkinError);
      }

      // Buscar reservas futuras (próximos hóspedes) para cada quarto
      // Buscar reservas com check-in futuro (após a data selecionada)
      // IMPORTANTE: Excluir canceladas
      // NOTA: Renomeado para nextReservationsQuery para evitar conflito com futureReservationsQuery acima
      let nextReservationsQuery = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*)
        `)
        .gt("checkin_date", dateStr)
        .in("status", ["pending", "confirmed", "preregistration"])
        .neq("status", "cancelled") // Excluir canceladas
        .order("checkin_date", { ascending: true });
      
      if (establishmentId) {
        nextReservationsQuery = nextReservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: nextReservations, error: nextError } = await nextReservationsQuery;
      
      if (nextError) {
        console.error("Erro ao buscar próximas reservas:", nextError);
      }

      // Buscar reservas recentes de check-out (últimos 3 dias) para mostrar hóspede anterior
      // IMPORTANTE: Excluir canceladas e buscar apenas check-outs que realmente ocorreram
      const threeDaysAgo = format(subDays(new Date(), 3), "yyyy-MM-dd");
      let recentCheckoutQuery = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*)
        `)
        .gte("checkout_date", threeDaysAgo)
        .lte("checkout_date", dateStr)
        .in("status", ["checkedout"]) // Apenas check-outs que realmente ocorreram
        .neq("status", "cancelled") // Excluir canceladas
        .order("checkout_date", { ascending: false });
      
      if (establishmentId) {
        recentCheckoutQuery = recentCheckoutQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: recentCheckouts, error: recentCheckoutError } = await recentCheckoutQuery;
      
      if (recentCheckoutError) {
        console.error("Erro ao buscar check-outs recentes:", recentCheckoutError);
      }

      // Buscar chamados de manutenção abertos
      let maintenanceQuery = supabase
        .from("maintenance_tickets")
        .select("*")
        .in("status", ["open", "in_progress"]);
      
      if (establishmentId) {
        maintenanceQuery = maintenanceQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: maintenanceTickets, error: maintenanceError } = await maintenanceQuery;
      
      if (maintenanceError) {
        console.error("Erro ao buscar manutenções:", maintenanceError);
      }

      // Mapear reservas por quarto
      // IMPORTANTE: Considerar todas as reservas ativas, não apenas as que têm room_id atribuído
      // Se uma reserva não tem room_id mas está na data selecionada, ela ainda pode ser relevante
      const reservationsByRoom: Record<string, any> = {};
      reservations?.forEach((reservation) => {
        // Ignorar reservas canceladas
        if (reservation.status !== "cancelled") {
          // Se a reserva tem room_id, mapear diretamente
          if (reservation.room_id) {
            // Se já existe uma reserva para este quarto, priorizar a que está mais ativa
            // (checkedin > confirmed > pending)
            const existing = reservationsByRoom[reservation.room_id];
            if (!existing) {
              reservationsByRoom[reservation.room_id] = reservation;
            } else {
              // Priorizar reservas com status mais ativo
              const statusPriority: Record<string, number> = {
                checkedin: 3,
                confirmed: 2,
                pending: 1,
                preregistration: 1,
                blocked: 0,
              };
              const currentPriority = statusPriority[reservation.status] || 0;
              const existingPriority = statusPriority[existing.status] || 0;
              
              // Se a nova reserva tem prioridade maior, substituir
              if (currentPriority > existingPriority) {
                reservationsByRoom[reservation.room_id] = reservation;
              }
              // Se tem mesma prioridade, verificar qual está mais próxima da data selecionada
              else if (currentPriority === existingPriority) {
                const currentCheckin = parseISO(reservation.checkin_date);
                const existingCheckin = parseISO(existing.checkin_date);
                const selectedDateObj = parseISO(dateStr);
                
                // Priorizar a que está mais próxima da data selecionada
                const currentDiff = Math.abs(differenceInDays(currentCheckin, selectedDateObj));
                const existingDiff = Math.abs(differenceInDays(existingCheckin, selectedDateObj));
                
                if (currentDiff < existingDiff) {
          reservationsByRoom[reservation.room_id] = reservation;
                }
              }
            }
          }
        }
      });

      // Mapear check-outs na data selecionada por quarto
      const checkoutsByRoom: Record<string, any> = {};
      checkoutReservations?.forEach((reservation) => {
        // Apenas check-outs que realmente ocorreram ou estão ocorrendo hoje
        if (reservation.room_id && reservation.status !== "cancelled") {
          checkoutsByRoom[reservation.room_id] = reservation;
        }
      });

      // Mapear check-ins na data selecionada por quarto
      const checkinsByRoom: Record<string, any> = {};
      checkinReservations?.forEach((reservation) => {
        // Apenas check-ins que realmente ocorreram
        if (reservation.room_id && reservation.status !== "cancelled") {
          checkinsByRoom[reservation.room_id] = reservation;
        }
      });

      // Mapear próximas reservas por quarto (apenas a primeira/próxima)
      // IMPORTANTE: Excluir reservas que já estão ativas (são a reserva atual)
      const nextReservationsByRoom: Record<string, any> = {};
      const activeReservationIds = new Set(reservations?.map(r => r.id) || []);
      
      nextReservations?.forEach((reservation) => {
        // Ignorar se já é uma reserva ativa
        if (activeReservationIds.has(reservation.id)) {
          return;
        }
        
        if (reservation.room_id && !nextReservationsByRoom[reservation.room_id]) {
          // Pegar apenas a primeira reserva futura (próxima) que não seja a atual
          nextReservationsByRoom[reservation.room_id] = reservation;
        }
      });

      // Mapear hóspedes anteriores por quarto (check-outs recentes)
      const previousGuestsByRoom: Record<string, any> = {};
      recentCheckouts?.forEach((reservation) => {
        if (reservation.room_id) {
          // Se já existe, manter a mais recente (já está ordenado)
          if (!previousGuestsByRoom[reservation.room_id]) {
            previousGuestsByRoom[reservation.room_id] = reservation;
          }
        }
      });

      // Mapear manutenções por quarto
      const maintenanceByRoom: Record<string, any> = {};
      maintenanceTickets?.forEach((ticket) => {
        if (ticket.room_id) {
          maintenanceByRoom[ticket.room_id] = ticket;
        }
      });

      // Processar cada quarto
      return roomsData?.map((room): RoomOccupancyData => {
        const reservation = reservationsByRoom[room.id];
        const checkoutToday = checkoutsByRoom[room.id];
        const checkinToday = checkinsByRoom[room.id];
        const maintenance = maintenanceByRoom[room.id];
        const nextReservation = nextReservationsByRoom[room.id];
        const previousGuest = previousGuestsByRoom[room.id];
        
        const category = room.room_categories;
        
        // Determinar status do quarto
        let status: RoomOccupancyStatus = "available";
        let reservationData: any = null;
        
        // IMPORTANTE: Se há reserva ativa, sempre definir reservationData
        // Isso garante que as informações do hóspede sejam sempre exibidas
        if (reservation) {
          reservationData = reservation;
        }

        // PRIORIDADE MÁXIMA: Status manual do quarto (campo status da tabela rooms)
        // Este status é definido manualmente pelo usuário e deve ter prioridade sobre tudo
        if (room.status) {
          // Mapear valores do ENUM room_status para RoomOccupancyStatus
          switch (room.status) {
            case 'maintenance':
              status = "maintenance";
              break;
            case 'blocked':
              status = "blocked";
              break;
            case 'cleaning':
              status = "dirty"; // cleaning = sujo/aguardando limpeza
              break;
            case 'occupied':
              // Se o status manual é 'occupied', verificar se há reserva para confirmar
              // Se não houver reserva, manter como ocupado (status manual tem prioridade)
              status = "occupied";
              if (reservation) {
                reservationData = reservation;
              }
              break;
            case 'available':
              // Se status manual é 'available', continuar com a lógica de reservas
              // (não definir status ainda, deixar a lógica abaixo determinar)
              break;
            default:
              // Para qualquer outro valor, usar o status do quarto diretamente
              // (pode ser necessário mapear se houver novos valores no ENUM)
              break;
          }
        }

        // Se o status manual já foi definido como maintenance, blocked, cleaning ou occupied (sem reserva),
        // não verificar reservas (status manual tem prioridade)
        const manualStatusSet = room.status && 
          (room.status === 'maintenance' || 
           room.status === 'blocked' || 
           room.status === 'cleaning' || 
           (room.status === 'occupied' && !reservation));

        // IMPORTANTE: Se não há reserva e não há status manual, garantir que o status seja 'available'
        // (a menos que haja manutenção ativa)
        if (!reservation && !manualStatusSet) {
          // Se há manutenção ativa, mostrar como manutenção
          if (maintenance) {
            status = "maintenance";
          } else {
            // Sem reserva e sem manutenção = disponível
            status = "available";
          }
        }

        // Prioridade 1: Manutenção (sobrescreve tudo, exceto status manual)
        // Se há manutenção ativa, mostrar como manutenção (independente de ter reserva)
        if (!manualStatusSet && maintenance) {
          status = "maintenance";
        }
        // Prioridade 2: Bloqueio por reserva (se não houver status manual de bloqueio)
        else if (!manualStatusSet && reservation?.status === "blocked") {
          status = "blocked";
          reservationData = reservation;
        }
        // Prioridade 3: Verificar check-out (sujo se passou do horário) - ANTES de verificar check-in
        // Verificar se há check-out hoje ou passado e se já passou do horário
        // (apenas se não houver status manual definido)
        else if (!manualStatusSet && reservation && reservation.checkout_date) {
          const checkoutDate = parseISO(reservation.checkout_date);
          const now = new Date();
          
          // Se check-out é hoje ou passado
          if (checkoutDate <= now) {
            // Verificar se já passou do horário de check-out
            let checkoutHour = 12; // Horário padrão
            let checkoutMinute = 0;
            
            // Se a reserva tem horário específico de check-out, usar ele
            if (reservation.checkout_time) {
              const timeParts = reservation.checkout_time.split(':');
              checkoutHour = parseInt(timeParts[0]) || 12;
              checkoutMinute = parseInt(timeParts[1]) || 0;
            }
            
            // Criar data/hora do check-out
            const checkoutDateTime = new Date(checkoutDate);
            checkoutDateTime.setHours(checkoutHour, checkoutMinute, 0, 0);
            
            // Se já passou do horário de check-out, quarto está sujo
            if (now >= checkoutDateTime) {
              // Verificar se há nova reserva para hoje (prioridade)
              const hasNewReservationToday = nextReservation && 
                nextReservation.checkin_date === dateStr;
              
              if (hasNewReservationToday) {
                status = "dirty_priority"; // 🟤 Sujo com prioridade
              } else {
                status = "dirty"; // 🟡 Sujo/Aguardando Limpeza
              }
              reservationData = reservation;
            }
          }
        }
        
        // Prioridade 4: Verificar se há reserva ativa para este quarto
        // (apenas se não houver status manual definido)
        if (!manualStatusSet && reservation) {
          // reservationData já foi definido acima, garantir que está correto
          if (!reservationData) {
            reservationData = reservation;
          }
          
          // Verificar status da reserva
          if (reservation.status === "checkedin") {
            // Check-in realizado - quarto está ocupado
            if (reservation.checkin_date <= dateStr) {
              status = "occupied";
            }
          } else if (reservation.status === "blocked") {
            // Bloqueio
            status = "blocked";
          } else if (reservation.status === "confirmed" || reservation.status === "pending" || reservation.status === "preregistration") {
            // Reserva confirmada/pendente - verificar se check-in já deveria ter ocorrido
            const checkinDate = parseISO(reservation.checkin_date);
            const checkoutDate = parseISO(reservation.checkout_date);
            const selectedDateObj = parseISO(dateStr);
            
            // Se a data selecionada está dentro do período da reserva (checkin <= date <= checkout)
            if (checkinDate <= selectedDateObj && checkoutDate >= selectedDateObj) {
              // Verificar se já passou do horário de check-in
              const now = new Date();
              let checkinHour = 14; // Horário padrão
              let checkinMinute = 0;
              
              if (reservation.checkin_time) {
                const timeParts = reservation.checkin_time.split(':');
                checkinHour = parseInt(timeParts[0]) || 14;
                checkinMinute = parseInt(timeParts[1]) || 0;
              }
              
              // Se check-in é hoje e já passou do horário, considerar ocupado
              if (isToday(checkinDate)) {
                const checkinTime = new Date();
                checkinTime.setHours(checkinHour, checkinMinute, 0, 0);
                
                if (now >= checkinTime) {
                  status = "occupied";
                } else {
                  status = "reserved";
                }
              } 
              // Se check-in é passado, considerar ocupado (mesmo sem check-in formal)
              else if (checkinDate < selectedDateObj) {
                status = "occupied";
              }
              // Se check-in é futuro, está reservado
              else {
                status = "reserved";
              }
            } 
            // Se check-in é futuro (fora do período)
            else if (checkinDate > selectedDateObj) {
              status = "reserved";
            }
            // Se está dentro do período mas checkout já passou
            else if (checkoutDate < selectedDateObj) {
              // Checkout já passou - quarto deveria estar sujo
              status = "dirty";
            }
          }
        }
        
        // Se ainda não definiu status e há check-out hoje (fallback)
        // (apenas se não houver status manual definido)
        if (!manualStatusSet && status === "available" && checkoutToday && isToday(parseISO(checkoutToday.checkout_date))) {
          // Verificar se há nova reserva para hoje (prioridade)
          const hasNewReservationToday = reservation && 
            reservation.checkin_date === dateStr && 
            reservation.status !== "checkedin";
          
          if (hasNewReservationToday) {
            status = "dirty_priority"; // 🟤 Sujo com prioridade
            if (!reservationData) {
              reservationData = reservation;
            }
          } else {
            status = "dirty"; // 🟡 Sujo
            if (!reservationData && checkoutToday) {
              reservationData = checkoutToday;
            }
          }
        }
        
        // Prioridade 7: Garantir que quartos sem reserva sejam 'available' (a menos que haja status manual ou manutenção)
        // Esta verificação já foi feita acima, mas garantir novamente no final
        if (!reservation && !manualStatusSet && !maintenance && status !== "maintenance") {
          status = "available";
        }
        
        // IMPORTANTE: Se não há reserva, limpar reservationData para não mostrar informações incorretas
        // EXCETO se houver status manual 'occupied' (que pode ter sido definido manualmente)
        if (!reservation && room.status !== 'occupied') {
          reservationData = null;
        }

        // Calcular informações da reserva
        let nightsRemaining: number | undefined;
        let checkoutText: string | undefined;
        
        if (reservationData) {
          const checkoutDate = reservationData.checkout_date 
            ? parseISO(reservationData.checkout_date)
            : null;
          
          if (checkoutDate) {
            const today = new Date();
            const diffDays = differenceInDays(checkoutDate, today);
            nightsRemaining = diffDays > 0 ? diffDays : 0;
            
            if (isToday(checkoutDate)) {
              checkoutText = "Hoje";
            } else if (isTomorrow(checkoutDate)) {
              checkoutText = "Amanhã";
            } else {
              checkoutText = format(checkoutDate, "dd/MM/yyyy", { locale: ptBR });
            }
          }
        }

        // Informações do hóspede anterior (que está saindo/fez check-out)
        // Prioridade: 1) Check-out hoje (mesmo que seja a reserva atual, pois está saindo)
        //             2) Hóspede anterior dos últimos 3 dias (se não for a reserva atual)
        let previousGuestToUse = null;
        if (checkoutToday) {
          // Se há check-out hoje, sempre mostrar como hóspede anterior (está saindo)
          previousGuestToUse = checkoutToday;
        } else if (previousGuest && previousGuest.id !== reservation?.id) {
          // Hóspede anterior dos últimos 3 dias (não a reserva atual)
          previousGuestToUse = previousGuest;
        }
        
        const previousGuestName = previousGuestToUse 
          ? (previousGuestToUse.guest?.full_name || previousGuestToUse.financial_responsible?.full_name)
          : undefined;
        const previousCheckoutDate = previousGuestToUse?.checkout_date;
        const previousCheckoutTime = previousGuestToUse?.checkout_time;
        const previousReservationCode = previousGuestToUse?.reservation_code;

        // Informações do próximo hóspede (que vai entrar)
        // IMPORTANTE: Garantir que nextReservation seja diferente da reserva atual
        const actualNextReservation = nextReservation && nextReservation.id !== reservation?.id 
          ? nextReservation 
          : null;
        
        const nextGuestName = actualNextReservation 
          ? (actualNextReservation.guest?.full_name || actualNextReservation.financial_responsible?.full_name || actualNextReservation.guest_name)
          : undefined;
        const nextCheckinDate = actualNextReservation?.checkin_date;
        const nextReservationCode = actualNextReservation?.reservation_code;
        const nextCheckinTime = actualNextReservation?.checkin_time;

        // Garantir que reservationData seja usado quando há reserva ativa
        // Se há reserva mas reservationData não foi definido, usar a reserva encontrada
        if (reservation && !reservationData) {
          reservationData = reservation;
        }
        
        // Extrair nome do hóspede de forma mais robusta
        const getGuestName = (res: any): string | undefined => {
          if (!res) return undefined;
          
          // Prioridade 1: guest_name desnormalizado (mais rápido e confiável)
          if (res.guest_name && res.guest_name.trim() !== "") {
            return res.guest_name.trim();
          }
          
          // Prioridade 2: guest.full_name (join com clients via guest_id)
          if (res.guest?.full_name && res.guest.full_name.trim() !== "") {
            return res.guest.full_name.trim();
          }
          
          // Prioridade 3: financial_responsible.full_name (join com clients via client_id)
          if (res.financial_responsible?.full_name && res.financial_responsible.full_name.trim() !== "") {
            return res.financial_responsible.full_name.trim();
          }
          
          return undefined;
        };

        return {
          id: room.id,
          room_number: room.room_number,
          name: room.name,
          category_id: category?.id || "",
          category_name: category?.name || "Sem categoria",
          status,
          reservation_id: reservationData?.id,
          reservation_code: reservationData?.reservation_code,
          identification_number: reservationData?.identification_number,
          guest_name: getGuestName(reservationData) || getGuestName(reservation),
          checkin_date: reservationData?.checkin_date || reservation?.checkin_date,
          checkout_date: reservationData?.checkout_date || reservation?.checkout_date,
          checkin_time: reservationData?.checkin_time || reservation?.checkin_time,
          checkout_time: reservationData?.checkout_time || reservation?.checkout_time,
          nights_remaining: nightsRemaining,
          adults: reservationData?.adults || reservation?.adults,
          children: reservationData?.children || reservation?.children,
          total_amount: reservationData?.total_amount || reservation?.total_amount,
          paid_amount: reservationData?.paid_amount || reservation?.paid_amount,
          payment_status: reservationData?.payment_status || reservation?.payment_status,
          reservation_status: reservationData?.status || reservation?.status,
          // Informações do hóspede anterior
          previous_guest_name: previousGuestName,
          previous_checkout_date: previousCheckoutDate,
          previous_checkout_time: previousCheckoutTime,
          previous_reservation_code: previousReservationCode,
          // Informações do próximo hóspede (apenas se for diferente do atual)
          next_guest_name: nextGuestName,
          next_checkin_date: nextCheckinDate,
          next_reservation_code: nextReservationCode,
          next_checkin_time: nextCheckinTime,
          // Flag para indicar se check-in ocorreu hoje
          checkin_occurred_today: checkinToday?.id === reservationData?.id && dateStr === format(new Date(), "yyyy-MM-dd"),
          // Flag para indicar se check-out ocorreu hoje
          checkout_occurred_today: checkoutToday?.id === reservationData?.id && dateStr === format(new Date(), "yyyy-MM-dd"),
          // Informações de limpeza/manutenção
          maintenance_ticket_id: maintenance?.id,
          maintenance_priority: maintenance?.priority,
          cleaning_priority: checkoutToday && reservation?.checkin_date === dateStr ? "urgent" : "normal",
          // Flags para indicar se check-in/check-out ocorreram na data selecionada
          // Check-in ocorreu se há check-in na data selecionada e status é checkedin
          checkin_occurred_today: checkinToday?.id === reservationData?.id || 
                                  (reservationData?.checkin_date === dateStr && reservationData?.status === "checkedin"),
          // Check-out ocorreu se há check-out na data selecionada e status é checkedout
          checkout_occurred_today: checkoutToday?.id === reservationData?.id || 
                                   (reservationData?.checkout_date === dateStr && reservationData?.status === "checkedout"),
        };
      }) || [];
    },
  });

  return {
    rooms: rooms || [],
    isLoading,
  };
};
