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
      // OU reservas futuras (checkin > dateStr) para mostrar status "reserved"
      let reservationsQuery = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
        .or(`and(checkin_date.lte.${dateStr},checkout_date.gte.${dateStr}),checkin_date.gte.${dateStr}`)
        .in("status", ["pending", "confirmed", "checkedin", "checkedout", "blocked", "preregistration"])
        .neq("status", "cancelled"); // Excluir explicitamente reservas canceladas
      
      if (establishmentId) {
        reservationsQuery = reservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: reservations, error: reservationsError } = await reservationsQuery;

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
      let futureReservationsQuery = supabase
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
        futureReservationsQuery = futureReservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: futureReservations, error: futureError } = await futureReservationsQuery;
      
      if (futureError) {
        console.error("Erro ao buscar reservas futuras:", futureError);
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
      const reservationsByRoom: Record<string, any> = {};
      reservations?.forEach((reservation) => {
        // Ignorar reservas canceladas
        if (reservation.room_id && reservation.status !== "cancelled") {
          reservationsByRoom[reservation.room_id] = reservation;
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
      const nextReservationsByRoom: Record<string, any> = {};
      futureReservations?.forEach((reservation) => {
        if (reservation.room_id && !nextReservationsByRoom[reservation.room_id]) {
          // Pegar apenas a primeira reserva futura (próxima)
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

        // Prioridade 1: Manutenção (sobrescreve tudo)
        if (maintenance) {
          status = "maintenance";
        }
        // Prioridade 2: Bloqueio
        else if (reservation?.status === "blocked") {
          status = "blocked";
          reservationData = reservation;
        }
        // Prioridade 3: Verificar check-out (sujo se passou do horário) - ANTES de verificar check-in
        // Verificar se há check-out hoje ou passado e se já passou do horário
        else if (reservation && reservation.checkout_date) {
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
                nextReservation.checkin_date === todayStr;
              
              if (hasNewReservationToday) {
                status = "dirty_priority"; // 🟤 Sujo com prioridade
              } else {
                status = "dirty"; // 🟡 Sujo/Aguardando Limpeza
              }
              reservationData = reservation;
            }
          }
        }
        
        // Prioridade 4: Check-in realizado (ocupado) - verificar se check-in ocorreu na data selecionada
        if (status === "available" && reservation?.status === "checkedin") {
          // Se check-in é hoje ou passado e status é checkedin, considerar ocupado
          if (reservation.checkin_date <= dateStr) {
            status = "occupied";
            reservationData = reservation;
          }
        }
        
        // Se ainda não definiu status e há check-out hoje (fallback)
        if (status === "available" && checkoutToday && isToday(parseISO(checkoutToday.checkout_date))) {
          // Verificar se há nova reserva para hoje (prioridade)
          const hasNewReservationToday = reservation && 
            reservation.checkin_date === todayStr && 
            reservation.status !== "checkedin";
          
          if (hasNewReservationToday) {
            status = "dirty_priority"; // 🟤 Sujo com prioridade
          } else {
            status = "dirty"; // 🟡 Sujo
          }
        }
        // Prioridade 5: Reserva confirmada mas check-in não realizado (reservado)
        else if (reservation && 
                 (reservation.status === "confirmed" || reservation.status === "preregistration")) {
          // Se check-in é futuro, está reservado
          if (reservation.checkin_date > dateStr) {
            status = "reserved";
            reservationData = reservation;
          }
          // Se check-in é hoje ou passado mas ainda não fez check-in
          else if (reservation.checkin_date <= dateStr && reservation.status !== "checkedin") {
            // Verificar se já passou do horário de check-in
            const now = new Date();
            let checkinHour = 14; // Horário padrão
            let checkinMinute = 0;
            
            // Se a reserva tem horário específico, usar ele
            if (reservation.checkin_time) {
              const timeParts = reservation.checkin_time.split(':');
              checkinHour = parseInt(timeParts[0]) || 14;
              checkinMinute = parseInt(timeParts[1]) || 0;
            }
            
            // Se é hoje e já passou do horário de check-in, considerar ocupado
            if (isToday(parseISO(reservation.checkin_date))) {
              const checkinTime = new Date();
              checkinTime.setHours(checkinHour, checkinMinute, 0, 0);
              
              if (now >= checkinTime) {
                status = "occupied";
              } else {
                status = "reserved";
              }
            } else {
              // Se check-in é passado mas não fez check-in, considerar ocupado
              status = "occupied";
            }
            reservationData = reservation;
          }
        }
        // Prioridade 7: Disponível
        else {
          status = "available";
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
        const nextGuestName = nextReservation 
          ? (nextReservation.guest?.full_name || nextReservation.financial_responsible?.full_name)
          : undefined;
        const nextCheckinDate = nextReservation?.checkin_date;
        const nextReservationCode = nextReservation?.reservation_code;
        const nextCheckinTime = nextReservation?.checkin_time;

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
          guest_name: reservationData?.guest?.full_name || reservationData?.financial_responsible?.full_name,
          checkin_date: reservationData?.checkin_date,
          checkout_date: reservationData?.checkout_date,
          checkin_time: reservationData?.checkin_time,
          checkout_time: reservationData?.checkout_time,
          nights_remaining: nightsRemaining,
          adults: reservationData?.adults,
          children: reservationData?.children,
          total_amount: reservationData?.total_amount,
          paid_amount: reservationData?.paid_amount,
          payment_status: reservationData?.payment_status,
          reservation_status: reservationData?.status,
          // Informações do hóspede anterior
          previous_guest_name: previousGuestName,
          previous_checkout_date: previousCheckoutDate,
          previous_checkout_time: previousCheckoutTime,
          previous_reservation_code: previousReservationCode,
          // Informações do próximo hóspede
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
