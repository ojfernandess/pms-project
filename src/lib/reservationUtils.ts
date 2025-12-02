import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Room = Database["public"]["Tables"]["rooms"]["Row"];
type Reservation = Database["public"]["Tables"]["reservations"]["Row"];
type RoomCategory = Database["public"]["Tables"]["room_categories"]["Row"];

/**
 * Calcula o número de noites entre duas datas
 */
export const calculateNights = (checkin: string, checkout: string): number => {
  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);
  const diffTime = Math.abs(checkoutDate.getTime() - checkinDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Calcula o valor total da reserva
 */
export const calculateReservationTotal = (
  basePrice: number,
  checkin: string,
  checkout: string
): number => {
  const nights = calculateNights(checkin, checkout);
  return basePrice * nights;
};

/**
 * Busca quartos disponíveis para um período
 */
export const getAvailableRooms = async (
  categoryId: string,
  checkinDate: string,
  checkoutDate: string,
  includeRoomId?: string // Quarto específico para incluir mesmo se ocupado (para edição)
): Promise<Room[]> => {
  const establishmentId = localStorage.getItem("selectedEstablishmentId");
  
  // Buscar todos os quartos da categoria
  let roomsQuery = supabase
    .from("rooms")
    .select("*")
    .eq("category_id", categoryId)
    .in("status", ["available", "cleaning"]) // Apenas quartos disponíveis ou em limpeza
    .eq("is_blocked", false); // Excluir quartos interditados

  if (establishmentId) {
    // Filtrar por estabelecimento através da categoria
    // (assumindo que categories tem establishment_id)
  }

  const { data: rooms, error: roomsError } = await roomsQuery;

  if (roomsError) throw roomsError;
  if (!rooms) return [];

  // Buscar reservas que conflitam com o período
  // IMPORTANTE: Verificar conflito considerando que checkout é exclusivo
  // Uma reserva que termina no dia X não conflita com uma que começa no dia X
  let reservationsQuery = supabase
    .from("reservations")
    .select("room_id")
    .eq("category_id", categoryId)
    .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
    .or(
      `and(checkin_date.lt.${checkoutDate},checkout_date.gt.${checkinDate})`
    );
  
  if (establishmentId) {
    reservationsQuery = reservationsQuery.eq("establishment_id", establishmentId);
  }
  
  const { data: conflictingReservations, error: reservationsError } = await reservationsQuery;

  if (reservationsError) throw reservationsError;

  // IDs de quartos ocupados
  const occupiedRoomIds = new Set(
    (conflictingReservations
      ?.map((r) => r.room_id)
      .filter((id): id is string => id !== null) || [])
  );

  // Filtrar quartos disponíveis (excluir ocupados e interditados)
  let availableRooms = rooms.filter(
    (room) => !occupiedRoomIds.has(room.id) && room.is_blocked !== true
  );

  // Se um quarto específico foi solicitado e não está na lista, buscar e adicioná-lo
  if (includeRoomId) {
    const alreadyInList = availableRooms.find((r) => r.id === includeRoomId);
    if (!alreadyInList) {
      // Buscar o quarto específico mesmo que não esteja na lista inicial
      const { data: requestedRoom, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", includeRoomId)
        .eq("category_id", categoryId)
        .single();
      
      if (!roomError && requestedRoom) {
        availableRooms.push(requestedRoom);
      }
    }
  }

  return availableRooms;
};

/**
 * Valida se um quarto pode ser reservado no período
 * Verifica conflitos com todas as reservas ativas (incluindo bloqueios)
 */
export const validateRoomAvailability = async (
  roomId: string,
  checkinDate: string,
  checkoutDate: string,
  excludeReservationId?: string
): Promise<{ available: boolean; reason?: string; conflictingReservation?: any }> => {
  const establishmentId = localStorage.getItem("selectedEstablishmentId");

  // Verificar status do quarto
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("status, room_number, name, is_blocked")
    .eq("id", roomId)
    .single();

  if (roomError) throw roomError;

  // Verificar se o quarto está interditado
  if (room.is_blocked === true) {
    return {
      available: false,
      reason: "Quarto está interditado - não é possível criar reservas",
    };
  }

  if (room.status !== "available" && room.status !== "cleaning") {
    return {
      available: false,
      reason: `Quarto está ${room.status === "maintenance" ? "em manutenção" : "bloqueado"}`,
    };
  }

  // Verificar conflitos de reserva (incluindo bloqueios e pré-reservas)
  // IMPORTANTE: Verificar conflito considerando que checkout é exclusivo
  // Uma reserva que termina no dia X não conflita com uma que começa no dia X
  let query = supabase
    .from("reservations")
    .select("id, reservation_code, status, checkin_date, checkout_date, guest_name, notes")
    .eq("room_id", roomId)
    .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
    .or(
      `and(checkin_date.lt.${checkoutDate},checkout_date.gt.${checkinDate})`
    );

  if (establishmentId) {
    query = query.eq("establishment_id", establishmentId);
  }

  if (excludeReservationId) {
    query = query.neq("id", excludeReservationId);
  }

  const { data: conflicts, error: conflictsError } = await query;

  if (conflictsError) throw conflictsError;

  if (conflicts && conflicts.length > 0) {
    const conflict = conflicts[0];
    const conflictType = conflict.status === "blocked" ? "bloqueado" : "reservado";
    const conflictInfo = conflict.status === "blocked" 
      ? `Bloqueio (${conflict.notes?.replace(/^Bloqueio:\s*/i, "") || "sem motivo"})`
      : (conflict.guest_name || conflict.reservation_code || "Reserva");
    
    return {
      available: false,
      reason: `Quarto já está ${conflictType} neste período por ${conflictInfo}`,
      conflictingReservation: conflict,
    };
  }

  return { available: true };
};

/**
 * Valida disponibilidade por categoria (quando não há quarto específico)
 * Verifica se há quartos disponíveis na categoria para o período
 */
export const validateCategoryAvailability = async (
  categoryId: string,
  checkinDate: string,
  checkoutDate: string,
  excludeReservationId?: string
): Promise<{ available: boolean; reason?: string; availableRooms?: number }> => {
  const establishmentId = localStorage.getItem("selectedEstablishmentId");

  // Buscar todos os quartos da categoria
  let roomsQuery = supabase
    .from("rooms")
    .select("id")
    .eq("category_id", categoryId)
    .in("status", ["available", "cleaning"])
    .eq("is_blocked", false); // Excluir quartos interditados

  if (establishmentId) {
    // Buscar establishment_id através da categoria
    const { data: category } = await supabase
      .from("room_categories")
      .select("establishment_id")
      .eq("id", categoryId)
      .single();
    
    if (category?.establishment_id) {
      // Filtrar quartos do estabelecimento (se a tabela rooms tiver establishment_id)
      // Por enquanto, assumimos que todos os quartos da categoria são do mesmo estabelecimento
    }
  }

  const { data: rooms, error: roomsError } = await roomsQuery;

  if (roomsError) throw roomsError;
  if (!rooms || rooms.length === 0) {
    return {
      available: false,
      reason: "Nenhum quarto disponível nesta categoria",
      availableRooms: 0,
    };
  }

  // Buscar reservas que conflitam com o período
  let reservationsQuery = supabase
    .from("reservations")
    .select("room_id")
    .eq("category_id", categoryId)
    .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
    .or(
      `and(checkin_date.lt.${checkoutDate},checkout_date.gt.${checkinDate})`
    );

  if (establishmentId) {
    reservationsQuery = reservationsQuery.eq("establishment_id", establishmentId);
  }

  if (excludeReservationId) {
    reservationsQuery = reservationsQuery.neq("id", excludeReservationId);
  }

  const { data: conflictingReservations, error: reservationsError } = await reservationsQuery;

  if (reservationsError) throw reservationsError;

  // IDs de quartos ocupados
  const occupiedRoomIds = new Set(
    (conflictingReservations
      ?.map((r) => r.room_id)
      .filter((id): id is string => id !== null) || [])
  );

  // Contar quartos disponíveis
  const availableRooms = rooms.filter(
    (room) => !occupiedRoomIds.has(room.id)
  ).length;

  if (availableRooms === 0) {
    return {
      available: false,
      reason: "Todos os quartos desta categoria estão ocupados ou bloqueados neste período",
      availableRooms: 0,
    };
  }

  return { 
    available: true,
    availableRooms,
  };
};

/**
 * Valida capacidade do quarto
 */
export const validateRoomCapacity = (
  category: RoomCategory,
  adults: number,
  children: number
): { valid: boolean; reason?: string } => {
  const totalGuests = adults + children;
  const maxCapacity = category.capacity_adults + category.capacity_children;

  if (adults > category.capacity_adults) {
    return {
      valid: false,
      reason: `Capacidade máxima de adultos: ${category.capacity_adults}`,
    };
  }

  if (totalGuests > maxCapacity) {
    return {
      valid: false,
      reason: `Capacidade máxima total: ${maxCapacity} hóspedes`,
    };
  }

  return { valid: true };
};

/**
 * Formata valor monetário
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

/**
 * Formata moeda sem mostrar centavos quando forem zero
 * Ex: R$ 380,00 -> R$ 380 | R$ 380,99 -> R$ 380,99
 */
export const formatCurrencyWithoutZeroCents = (value: number): string => {
  const cents = Math.round((value % 1) * 100);
  if (cents === 0) {
    // Sem centavos, mostrar apenas o valor inteiro
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } else {
    // Com centavos, mostrar normalmente
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }
};

/**
 * Formata CNPJ (00.000.000/0000-00)
 */
export const formatCNPJ = (value: string): string => {
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, "");
  
  // Aplica a máscara
  if (numbers.length <= 2) {
    return numbers;
  } else if (numbers.length <= 5) {
    return `${numbers.slice(0, 2)}.${numbers.slice(2)}`;
  } else if (numbers.length <= 8) {
    return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5)}`;
  } else if (numbers.length <= 12) {
    return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8)}`;
  } else {
    return `${numbers.slice(0, 2)}.${numbers.slice(2, 5)}.${numbers.slice(5, 8)}/${numbers.slice(8, 12)}-${numbers.slice(12, 14)}`;
  }
};

/**
 * Formata CPF (000.000.000-00)
 */
export const formatCPF = (value: string): string => {
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, "");
  
  // Aplica a máscara
  if (numbers.length <= 3) {
    return numbers;
  } else if (numbers.length <= 6) {
    return `${numbers.slice(0, 3)}.${numbers.slice(3)}`;
  } else if (numbers.length <= 9) {
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6)}`;
  } else {
    return `${numbers.slice(0, 3)}.${numbers.slice(3, 6)}.${numbers.slice(6, 9)}-${numbers.slice(9, 11)}`;
  }
};

/**
 * Formata data para exibição
 */
export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString("pt-BR");
};

