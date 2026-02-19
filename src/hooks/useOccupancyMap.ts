import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, isToday, isTomorrow, parseISO, differenceInDays, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export type RoomOccupancyStatus = 
  | "available"      // 🟢 Disponível/Limpo
  | "occupied"       // 🔴 Ocupado
  | "dirty"          // 🟡 Sujo/Aguardando Limpeza
  | "maintenance"    // 🔵 Em Manutenção
  | "blocked"        // ⚫ Bloqueado
  | "reserved"       // 🟣 Reservado (Check-in Futuro / Chegada Hoje)
  | "inspection"     // 🟠 Aguardando Inspeção
  | "dirty_priority" // 🟤 Sujo com Prioridade
  | "last_day";      // 🔴 Último dia (Checkout Hoje)

/** Classificação operacional da reserva no dia */
export type ReservationOperationalType =
  | "stayover"       // checkin < today, checkout > today
  | "checkout_today" // checkout_date = today
  | "checkin_today"  // checkin_date = today
  | "day_use"        // checkin = today AND checkout = today
  | "no_show";       // checkin_date = today AND status = noshow

export interface RoomOccupancyData {
  id: string;
  room_number: string;
  name?: string;
  category_id: string;
  category_name: string;
  building_name?: string;
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
  previous_checkin_date?: string;
  previous_checkin_time?: string;
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
  
  // Flag para indicar se o quarto está sujo (dirty) mesmo estando disponível
  // Usado quando há check-out ou passou do horário de check-out
  is_dirty?: boolean;
  
  // Classificação operacional e tag de exibição
  reservation_operational_type?: ReservationOperationalType;
  display_tag?: string; // "Checkout Hoje", "Chegada Hoje", "Último dia", "Stayover", "Day Use", "No-Show"
}

/** Resumo operacional do dia para o mapa de ocupação */
export interface OccupancyOperationalSummary {
  total_rooms: number;
  saídas_hoje: number;
  entradas_hoje: number;
  stayovers: number;
  disponíveis: number;
  sujo: number;
  manutenção: number;
  bloqueados: number;
  taxa_ocupacao_real: number; // percentual 0-100
}

/** Classifica a reserva no dia operacional (data selecionada) */
function getReservationOperationalType(
  res: { checkin_date?: string; checkout_date?: string; status?: string },
  dateStr: string
): ReservationOperationalType | undefined {
  if (!res?.checkin_date || !res?.checkout_date) return undefined;
  const checkin = parseISO(res.checkin_date);
  const checkout = parseISO(res.checkout_date);
  const today = parseISO(dateStr);
  checkin.setHours(0, 0, 0, 0);
  checkout.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const cin = checkin.getTime();
  const cout = checkout.getTime();
  const t = today.getTime();

  if (res.status === "noshow" && cin === t) return "no_show";
  if (cin === t && cout === t) return "day_use";
  if (cout === t) return "checkout_today";
  if (cin === t) return "checkin_today";
  if (cin < t && cout > t) return "stayover";
  return undefined;
}

export const useOccupancyMap = (selectedDate?: Date) => {
  const { selectedEstablishment } = useEstablishment();
  // Normalizar a data para o início do dia para evitar problemas de timezone
  const date = startOfDay(selectedDate || new Date());
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["occupancy_map_rooms", selectedEstablishment?.id, dateStr],
    refetchInterval: 30_000, // Atualização a cada 30s (check-in, check-out, limpeza, etc.)
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id;
      
      console.log("useOccupancyMap: Iniciando busca", {
        establishmentId,
        selectedEstablishment: selectedEstablishment?.name,
        dateStr
      });
      
      const emptySummary: OccupancyOperationalSummary = {
        total_rooms: 0,
        saídas_hoje: 0,
        entradas_hoje: 0,
        stayovers: 0,
        disponíveis: 0,
        sujo: 0,
        manutenção: 0,
        bloqueados: 0,
        taxa_ocupacao_real: 0,
      };

      if (!establishmentId) {
        console.warn("useOccupancyMap: Nenhum estabelecimento selecionado");
        return { rooms: [], summary: emptySummary };
      }
      
      if (establishmentId) {
        localStorage.setItem("selectedEstablishmentId", establishmentId);
      }
      
      // Buscar todos os quartos com suas categorias
      // IMPORTANTE: Usar relacionamento correto - room_categories é uma tabela separada
      // O relacionamento é via category_id (foreign key)
      // Usar left join para incluir quartos mesmo sem categoria
      let roomsQuery = supabase
        .from("rooms")
        .select(`
          *,
          room_categories (
            *,
            buildings (
              id,
              name
            )
          )
        `)
        .eq("establishment_id", establishmentId)
        .order("room_number", { ascending: true });
      
      console.log("useOccupancyMap: Executando query de quartos");
      const { data: roomsData, error: roomsError } = await roomsQuery;

      console.log("useOccupancyMap: Resultado da query", {
        roomsCount: roomsData?.length || 0,
        error: roomsError,
        hasData: !!roomsData
      });

      if (roomsError) {
        console.error("Erro ao buscar quartos:", roomsError);
        throw roomsError;
      }
      
      if (!roomsData || roomsData.length === 0) {
        console.warn("useOccupancyMap: Nenhum quarto encontrado para o estabelecimento:", establishmentId);
        return { rooms: [], summary: emptySummary };
      }
      
      console.log("useOccupancyMap: Quartos encontrados:", roomsData.length);

      // Buscar reservas que podem afetar o status na data selecionada
      // Buscar reservas onde a data está entre checkin e checkout (inclusive checkin, exclusivo checkout)
      // OU reservas futuras (checkin >= dateStr) para mostrar status "reserved"
      // IMPORTANTE: Fazer duas queries separadas e combinar para garantir que todas sejam encontradas
      
      // Query base operacional: reservas no dia (checkin_date <= dateStr AND checkout_date >= dateStr)
      // Inclui noshow para classificar e liberar quarto; checkedout para fluxo checkout → limpeza → check-in
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
        .in("status", ["pending", "unpaid", "confirmed", "checkedin", "checkedout", "blocked", "preregistration", "noshow"])
        .neq("status", "cancelled");
      
      if (establishmentId) {
        activeReservationsQuery = activeReservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: activeReservations, error: activeError } = await activeReservationsQuery;
      
      // Query 2: Reservas futuras (checkin_date >= dateStr)
      // IMPORTANTE: Incluir "unpaid" para considerar reservas sem pagamento
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
        .in("status", ["pending", "unpaid", "confirmed", "checkedin", "checkedout", "blocked", "preregistration"])
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
        .in("status", ["pending", "unpaid", "confirmed", "preregistration"])
        .neq("status", "cancelled") // Excluir canceladas
        .order("checkin_date", { ascending: true });
      
      if (establishmentId) {
        nextReservationsQuery = nextReservationsQuery.eq("establishment_id", establishmentId);
      }
      
      const { data: nextReservations, error: nextError } = await nextReservationsQuery;
      
      if (nextError) {
        console.error("Erro ao buscar próximas reservas:", nextError);
      }

      // Buscar reservas recentes de check-out para mostrar hóspede anterior
      // Prioridade: Sempre buscar o check-out mais recente
      // - Para data atual: buscar check-outs dos últimos 7 dias (para pegar o mais recente)
      // - Para datas futuras: buscar check-outs até a data selecionada (máximo 7 dias antes)
      // - Para datas passadas: buscar check-outs até a data selecionada (máximo 7 dias antes)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDateForQuery = parseISO(dateStr);
      selectedDateForQuery.setHours(0, 0, 0, 0);
      
      // Determinar a data de início da busca (7 dias antes para garantir que pegamos o mais recente)
      const referenceDate = selectedDateForQuery > today ? selectedDateForQuery : today;
      const sevenDaysBefore = format(subDays(referenceDate, 7), "yyyy-MM-dd");
      
      // Buscar check-outs que ocorreram entre 7 dias antes e a data selecionada
      // Ordenar por checkout_date DESC para pegar o mais recente primeiro
      let recentCheckoutQuery = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*)
        `)
        .gte("checkout_date", sevenDaysBefore)
        .lte("checkout_date", dateStr)
        .in("status", ["checkedout"]) // Apenas check-outs que realmente ocorreram
        .neq("status", "cancelled") // Excluir canceladas
        .order("checkout_date", { ascending: false }); // Mais recente primeiro
      
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

      // Mapear check-outs na data selecionada por quarto (quem está saindo hoje)
      // Incluir TODAS as reservas com checkout_date = hoje, não só checkedin/checkedout,
      // para sempre mostrar "hóspede anterior" quando existe saída no dia
      const checkoutsByRoom: Record<string, any> = {};
      checkoutReservations?.forEach((reservation) => {
        if (reservation.room_id && reservation.status !== "cancelled") {
          checkoutsByRoom[reservation.room_id] = reservation;
        }
      });
      reservations?.forEach((reservation) => {
        if (reservation.room_id && reservation.status !== "cancelled" && reservation.checkout_date === dateStr) {
          if (!checkoutsByRoom[reservation.room_id]) {
            checkoutsByRoom[reservation.room_id] = reservation;
          }
        }
      });

      // Mapear check-ins na data selecionada por quarto
      const checkinsByRoom: Record<string, any> = {};
      checkinReservations?.forEach((reservation) => {
        if (reservation.room_id && reservation.status !== "cancelled") {
          checkinsByRoom[reservation.room_id] = reservation;
        }
      });

      // Mapear reservas com CHEGADA HOJE por quarto (quem vai entrar)
      // Usado para prioridade operacional: no mesmo dia mostrar saindo + entrando
      const arrivingTodayByRoom: Record<string, any> = {};
      reservations?.forEach((reservation) => {
        if (reservation.room_id && reservation.status !== "cancelled" && reservation.checkin_date === dateStr) {
          if (!arrivingTodayByRoom[reservation.room_id]) {
            arrivingTodayByRoom[reservation.room_id] = reservation;
          }
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
      // Criar selectedDateObj uma vez para usar em todo o processamento
      const selectedDateObj = parseISO(dateStr);
      selectedDateObj.setHours(0, 0, 0, 0);
      
      console.log("useOccupancyMap: Iniciando processamento", {
        roomsDataLength: roomsData.length,
        reservationsCount: Object.keys(reservationsByRoom).length,
        nextReservationsCount: Object.keys(nextReservationsByRoom).length
      });
      
      let processedRooms: RoomOccupancyData[] = [];
      let summary: OccupancyOperationalSummary = emptySummary;

      try {
        processedRooms = roomsData.map((room): RoomOccupancyData => {
        const reservation = reservationsByRoom[room.id];
        const checkoutToday = checkoutsByRoom[room.id];
        const arrivingToday = arrivingTodayByRoom[room.id];
        const checkinToday = checkinsByRoom[room.id];
        const maintenance = maintenanceByRoom[room.id];
        const nextReservation = nextReservationsByRoom[room.id];
        const previousGuest = previousGuestsByRoom[room.id];
        
        // room_categories pode ser um objeto único ou um array (dependendo do relacionamento)
        // Se for array, pegar o primeiro elemento; se for objeto, usar diretamente
        const category = Array.isArray(room.room_categories) 
          ? (room.room_categories.length > 0 ? room.room_categories[0] : null)
          : room.room_categories;
        
        // Extrair building_name da categoria (buildings pode ser objeto ou array)
        let buildingName: string | undefined = undefined;
        if (category?.buildings) {
          if (Array.isArray(category.buildings)) {
            buildingName = category.buildings.length > 0 ? category.buildings[0]?.name : undefined;
          } else {
            buildingName = category.buildings?.name;
          }
        }
        
        // ============================================
        // LÓGICA SIMPLIFICADA E DIRETA
        // ============================================
        
        // 1. PRIMEIRO: Verificar se há reserva realmente ativa na data selecionada
        let hasActiveReservation = false;
        let reservationData: any = null;
        
        if (reservation) {
          const checkinDate = reservation.checkin_date ? parseISO(reservation.checkin_date) : null;
          const checkoutDate = reservation.checkout_date ? parseISO(reservation.checkout_date) : null;
          
          if (checkinDate && checkoutDate) {
            checkinDate.setHours(0, 0, 0, 0);
            checkoutDate.setHours(0, 0, 0, 0);
            const selectedDateObj = parseISO(dateStr);
            selectedDateObj.setHours(0, 0, 0, 0);
            
            // NO_SHOW: checkin_date = today e status = noshow → quarto fica disponível
            if (reservation.status === "noshow" && checkinDate.getTime() === selectedDateObj.getTime()) {
              hasActiveReservation = false;
              reservationData = null;
            }
            // Reserva está ativa se: período cobre a data e não é checkedout/cancelled
            else if (checkinDate <= selectedDateObj && 
                checkoutDate >= selectedDateObj && 
                reservation.status !== "checkedout" &&
                reservation.status !== "cancelled") {
              hasActiveReservation = true;
              reservationData = reservation;
            }
          }
        }
        
        // 2. INICIALIZAR VARIÁVEIS
        let status: RoomOccupancyStatus = "available";
        let isDirty = false;

        // 3. PRIORIDADE 1: Status manual do quarto (campo status da tabela rooms)
        // Este status é definido manualmente pelo usuário e tem prioridade máxima
        const hasManualStatus = room.status && 
          (room.status === 'maintenance' || 
           room.status === 'blocked' || 
           room.status === 'cleaning' || 
           room.status === 'occupied');
        
        if (hasManualStatus) {
          switch (room.status) {
            case 'maintenance':
              status = "maintenance";
              break;
            case 'blocked':
              status = "blocked";
              break;
            case 'cleaning':
              status = "dirty";
              break;
            case 'occupied':
              status = "occupied";
              // Se há reserva, usar ela para dados
              if (reservation) {
                reservationData = reservation;
              }
              break;
          }
        }
        
        // 4. Se não há status manual, determinar status baseado em reservas e manutenção
        if (!hasManualStatus) {
          // 4.1. Manutenção ativa tem prioridade
          if (maintenance) {
            status = "maintenance";
          }
          // 4.2. Se há reserva ativa, determinar status baseado no status da reserva
          else if (hasActiveReservation && reservationData) {
            if (reservationData.status === "blocked") {
              status = "blocked";
            } else if (reservationData.status === "checkedin") {
              status = "occupied";
            } else if (reservationData.status === "confirmed" || 
                       reservationData.status === "pending" || 
                       reservationData.status === "unpaid" ||
                       reservationData.status === "preregistration") {
              // Verificar horário de check-in
              const checkinDate = parseISO(reservationData.checkin_date);
              const now = new Date();
              let checkinHour = 14;
              let checkinMinute = 0;
              
              if (reservationData.checkin_time) {
                const timeParts = reservationData.checkin_time.split(':');
                checkinHour = parseInt(timeParts[0]) || 14;
                checkinMinute = parseInt(timeParts[1]) || 0;
              }
              
              const checkinDateObj = parseISO(reservationData.checkin_date);
              checkinDateObj.setHours(0, 0, 0, 0);
              
              if (isToday(checkinDateObj)) {
                const checkinTime = new Date();
                checkinTime.setHours(checkinHour, checkinMinute, 0, 0);
                status = now >= checkinTime ? "occupied" : "reserved";
              } else if (checkinDateObj < selectedDateObj) {
                status = "occupied";
              } else {
                status = "reserved";
              }
            }
          }
          // 4.3. Se não há reserva ativa, verificar check-outs recentes
          else if (!hasActiveReservation) {
            // Verificar se há check-out hoje ou passado que já passou do horário
            const now = new Date();
            let hasRecentCheckout = false;
            
            if (checkoutToday) {
              const checkoutDate = parseISO(checkoutToday.checkout_date);
              let checkoutHour = 12;
              let checkoutMinute = 0;
              
              if (checkoutToday.checkout_time) {
                const timeParts = checkoutToday.checkout_time.split(':');
                checkoutHour = parseInt(timeParts[0]) || 12;
                checkoutMinute = parseInt(timeParts[1]) || 0;
              }
              
              const checkoutDateTime = new Date(checkoutDate);
              checkoutDateTime.setHours(checkoutHour, checkoutMinute, 0, 0);
              
              if (now >= checkoutDateTime) {
                hasRecentCheckout = true;
                reservationData = checkoutToday;
              }
            }
            
            // Se há check-out recente, verificar se há próxima reserva
            if (hasRecentCheckout) {
              const hasNextReservation = nextReservation && 
                nextReservation.id !== checkoutToday.id;
              
              status = "available";
              isDirty = hasNextReservation;
            } else {
              // Sem reserva ativa e sem check-out recente = sempre disponível
              status = "available";
              isDirty = false;
              reservationData = null;
            }
          }
        }
        
        // 5. GARANTIA FINAL: Se não há reserva ativa, SEMPRE deve ser "available"
        // (exceto se houver status manual ou manutenção)
        if (!hasActiveReservation && !hasManualStatus && !maintenance) {
          status = "available";
          if (!checkoutToday) {
            reservationData = null;
          }
        }
        
        // 6. Limpar reservationData se não há reserva ativa (exceto status manual occupied)
        if (!hasActiveReservation && room.status !== 'occupied') {
          // Manter reservationData apenas se for check-out recente
          if (!checkoutToday || status !== "available") {
            reservationData = null;
          }
        }

        // 7. Classificação operacional e regras visuais (Último dia, Chegada Hoje, tags)
        let operationalType: ReservationOperationalType | undefined = reservationData
          ? getReservationOperationalType(reservationData, dateStr)
          : undefined;
        let displayTag: string | undefined;

        if (!hasManualStatus || (room.status !== "maintenance" && room.status !== "blocked")) {
          // Checkout hoje e ainda não fez check-out → Último dia
          if (
            hasActiveReservation &&
            reservationData?.checkout_date === dateStr &&
            reservationData?.status !== "checkedout"
          ) {
            status = "last_day";
            displayTag = "Checkout Hoje";
          } else if (status === "reserved" && reservationData?.checkin_date === dateStr) {
            displayTag = "Chegada Hoje";
          } else if (status === "occupied") {
            displayTag = "Ocupado";
          } else if (status === "dirty") {
            displayTag = "Sujo / Aguardando Limpeza";
          } else if (status === "available") {
            displayTag = "Disponível";
          }
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

        // ============================================
        // LÓGICA DE INFORMAÇÕES DOS HÓSPEDES
        // Prioridade: Data atual > Reserva mais recente > Próxima reserva
        // ============================================
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isSelectedDateToday = selectedDateObj.getTime() === today.getTime();
        const isFutureDate = selectedDateObj > today;
        
        // 1. HÓSPEDE ANTERIOR (mais recente que fez check-out)
        // Lógica ajustada:
        //   - Se há reserva atual que já passou do checkout: mostrar ela como anterior
        //   - Se há check-out na data selecionada: mostrar esse check-out (prioridade máxima)
        //   - Se é data atual ou passada: mostrar o check-out mais recente até a data selecionada
        //   - Se é data futura: mostrar apenas se houver check-out na data selecionada
        let previousGuestToUse = null;
        
        // Verificar se a reserva atual já passou do checkout
        let currentReservationPassedCheckout = false;
        if (reservation && reservation.checkout_date) {
          const checkoutDate = parseISO(reservation.checkout_date);
          checkoutDate.setHours(0, 0, 0, 0);
          if (selectedDateObj > checkoutDate) {
            currentReservationPassedCheckout = true;
            // Se a reserva atual já passou do checkout, ela vira o hóspede anterior
            previousGuestToUse = reservation;
          }
        }
        
        if (!previousGuestToUse) {
          if (checkoutToday) {
            // Check-out na data selecionada tem prioridade máxima
            previousGuestToUse = checkoutToday;
          } else if (previousGuest && previousGuest.id !== reservation?.id) {
            const previousCheckoutDate = previousGuest.checkout_date ? parseISO(previousGuest.checkout_date) : null;
            
            if (previousCheckoutDate) {
              previousCheckoutDate.setHours(0, 0, 0, 0);
              
              // Para data atual ou passada: mostrar hóspede anterior mais recente
              if (!isFutureDate && previousCheckoutDate <= selectedDateObj) {
                previousGuestToUse = previousGuest;
              }
              // Para data futura: mostrar apenas se o check-out foi na data selecionada
              else if (isFutureDate && previousCheckoutDate.getTime() === selectedDateObj.getTime()) {
                previousGuestToUse = previousGuest;
              }
            }
          }
        }
        
        const previousGuestName = previousGuestToUse 
          ? (previousGuestToUse.guest?.full_name || previousGuestToUse.financial_responsible?.full_name || previousGuestToUse.guest_name)
          : undefined;
        const previousCheckinDate = previousGuestToUse?.checkin_date;
        const previousCheckinTime = previousGuestToUse?.checkin_time;
        const previousCheckoutDate = previousGuestToUse?.checkout_date;
        const previousCheckoutTime = previousGuestToUse?.checkout_time;
        const previousReservationCode = previousGuestToUse?.reservation_code;

        // 2. HÓSPEDE ATUAL (reserva ativa na data selecionada)
        // Se a reserva atual já passou do checkout, não mostrar como atual
        // Já determinado acima na lógica de hasActiveReservation
        // Se há reserva ativa e não passou do checkout, reservationData já está definido
        
        // Se a reserva atual já passou do checkout, limpar reservationData
        if (currentReservationPassedCheckout && reservationData?.id === reservation?.id) {
          reservationData = null;
        }
        
        // 3. PRÓXIMO HÓSPEDE (próxima reserva futura)
        // Lógica ajustada:
        //   - Se há reserva ativa que NÃO passou do checkout: mostrar próxima reserva diferente da atual
        //   - Se há reserva ativa que JÁ passou do checkout: mostrar próxima reserva (pode ser a primeira futura)
        //   - Se não há reserva ativa: mostrar próxima reserva (pode ser a primeira futura)
        //   - Para datas futuras sem reserva ativa: sempre mostrar próximo hóspede se existir
        let actualNextReservation = null;
        
        if (nextReservation) {
          // Se há reserva ativa que não passou do checkout, garantir que próxima seja diferente da atual
          if (reservation && !currentReservationPassedCheckout) {
            if (nextReservation.id !== reservation.id) {
              actualNextReservation = nextReservation;
            }
          } 
          // Se não há reserva ativa OU a reserva atual já passou do checkout, mostrar próxima reserva
          else {
            actualNextReservation = nextReservation;
          }
        }
        
        // Se a próxima reserva é a mesma da anterior (check-in recente), garantir que seja mostrada
        if (actualNextReservation && previousGuestToUse && 
            actualNextReservation.id === previousGuestToUse.id) {
          // Se a próxima é a mesma da anterior, significa que é um check-in recente
          // Manter como próxima para mostrar informações de check-in
        }

        // Prioridade operacional: mesmo dia com SAÍDA + ENTRADA
        // Quando há checkout hoje E chegada hoje no mesmo quarto, exibir quem SAI como anterior
        // e quem ENTRA como "atual" (reservationData), para não mostrar badge CHECKOUT na linha do entrante
        if (checkoutToday && arrivingToday && checkoutToday.id !== arrivingToday.id) {
          previousGuestToUse = checkoutToday;
          reservationData = arrivingToday;
          operationalType = getReservationOperationalType(arrivingToday, dateStr);
          displayTag = "Chegada Hoje";
          status = "reserved";
        }
        
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
          building_name: buildingName,
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
          previous_checkin_date: previousCheckinDate,
          previous_checkin_time: previousCheckinTime,
          previous_checkout_date: previousCheckoutDate,
          previous_checkout_time: previousCheckoutTime,
          previous_reservation_code: previousReservationCode,
          // Informações do próximo hóspede (apenas se for diferente do atual)
          next_guest_name: nextGuestName,
          next_checkin_date: nextCheckinDate,
          next_reservation_code: nextReservationCode,
          next_checkin_time: nextCheckinTime,
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
          // Flag para indicar se está sujo (mesmo estando disponível)
          is_dirty: isDirty,
          // Classificação operacional e tag de exibição
          reservation_operational_type: operationalType,
          display_tag: displayTag,
        };
      });

      // Resumo operacional do dia
      summary = {
        total_rooms: processedRooms.length,
        saídas_hoje: processedRooms.filter(
          (r) => r.reservation_operational_type === "checkout_today" || r.status === "last_day"
        ).length,
        entradas_hoje: processedRooms.filter(
          (r) =>
            r.reservation_operational_type === "checkin_today" ||
            r.reservation_operational_type === "day_use"
        ).length,
        stayovers: processedRooms.filter((r) => r.reservation_operational_type === "stayover").length,
        disponíveis: processedRooms.filter((r) => r.status === "available").length,
        sujo: processedRooms.filter((r) => r.status === "dirty" || r.status === "dirty_priority").length,
        manutenção: processedRooms.filter((r) => r.status === "maintenance").length,
        bloqueados: processedRooms.filter((r) => r.status === "blocked").length,
        taxa_ocupacao_real:
          processedRooms.length > 0
            ? Math.round(
                (processedRooms.filter(
                  (r) =>
                    r.status === "occupied" ||
                    r.status === "last_day" ||
                    r.status === "reserved"
                ).length /
                  processedRooms.length) *
                  100
              )
            : 0,
      };
      } catch (error) {
        console.error("useOccupancyMap: Erro ao processar quartos:", error);
        throw error;
      }
      
      console.log("useOccupancyMap: Processamento concluído", {
        processedRoomsCount: processedRooms?.length || 0,
        summary,
      });

      return { rooms: processedRooms || [], summary };
    },
  });

  return {
    rooms: rooms?.rooms ?? [],
    summary: rooms?.summary ?? {
      total_rooms: 0,
      saídas_hoje: 0,
      entradas_hoje: 0,
      stayovers: 0,
      disponíveis: 0,
      sujo: 0,
      manutenção: 0,
      bloqueados: 0,
      taxa_ocupacao_real: 0,
    },
    isLoading,
  };
};
