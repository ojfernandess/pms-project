import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, eachDayOfInterval, startOfDay } from "date-fns";

export interface AvailabilityData {
  categoryId: string;
  categoryName: string;
  roomId: string;
  roomNumber: string;
  date: string;
  available: number; // 0 ou 1 para quartos individuais
}

export interface CategoryAvailability {
  categoryId: string;
  categoryName: string;
  buildingId?: string | null;
  buildingName?: string | null;
  totalRooms: number;
  dates: Record<string, number>; // date -> available count
  rooms: Array<{
    roomId: string;
    roomNumber: string;
    dates: Record<string, number>; // date -> available (0 ou 1)
  }>;
}

export const useAvailabilityMap = (
  startDate: Date,
  endDate: Date,
  categoryId?: string,
  ratePlanId?: string
) => {
  const { selectedEstablishment } = useEstablishment();

  const { data, isLoading, error } = useQuery({
    queryKey: [
      "availability_map",
      selectedEstablishment?.id,
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd"),
      categoryId,
      ratePlanId,
    ],
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id;
      if (!establishmentId) return [];

      const dates = eachDayOfInterval({
        start: startOfDay(startDate),
        end: startOfDay(endDate),
      });

      // Buscar todas as categorias (ou categoria específica) com informações do prédio
      let categoriesQuery = supabase
        .from("room_categories")
        .select("id, name, building_id, buildings(id, name)")
        .eq("establishment_id", establishmentId)
        .order("name");

      if (categoryId && categoryId !== "all") {
        categoriesQuery = categoriesQuery.eq("id", categoryId);
      }

      const { data: categories, error: categoriesError } = await categoriesQuery;
      if (categoriesError) throw categoriesError;
      if (!categories || categories.length === 0) return [];

      const result: CategoryAvailability[] = [];

      for (const category of categories) {
        // Buscar todos os quartos da categoria
        const { data: rooms, error: roomsError } = await supabase
          .from("rooms")
          .select("id, room_number")
          .eq("category_id", category.id)
          .order("room_number");

        if (roomsError) throw roomsError;
        if (!rooms || rooms.length === 0) continue;

        const roomIds = rooms.map((r) => r.id);
        const totalRooms = rooms.length;

        // Para cada data, calcular disponibilidade
        const categoryDates: Record<string, number> = {};
        const roomAvailabilities: Array<{
          roomId: string;
          roomNumber: string;
          dates: Record<string, number>;
        }> = [];

        for (const room of rooms) {
          const roomDates: Record<string, number> = {};
          roomAvailabilities.push({
            roomId: room.id,
            roomNumber: room.room_number,
            dates: roomDates,
          });
        }

        // Buscar todas as reservas ativas para o período e categoria de uma vez
        // IMPORTANTE: Incluir TODAS as reservas ativas, independente do status de pagamento
        // Isso inclui: pending, unpaid, confirmed, checkedin, blocked, preregistration
        // Reservas sem pagamento (status = "unpaid" ou paid_amount = 0) também ocupam o quarto
        const startDateStr = format(dates[0], "yyyy-MM-dd");
        const endDateStr = format(dates[dates.length - 1], "yyyy-MM-dd");

        const { data: allReservations, error: reservationsError } = await supabase
          .from("reservations")
          .select("room_id, checkin_date, checkout_date, status, paid_amount, total_amount")
          .eq("establishment_id", establishmentId)
          .eq("category_id", category.id)
          .in("status", [
            "pending",           // Reservas pendentes (com ou sem pagamento)
            "unpaid",            // Reservas sem pagamento (paid_amount = 0) - IMPORTANTE!
            "confirmed",         // Reservas confirmadas (com ou sem pagamento)
            "checkedin",         // Hóspedes já fizeram check-in
            "blocked",           // Bloqueios de quarto (ocupam o quarto)
            "preregistration",   // Pré-reservas (ocupam o quarto mesmo sem pagamento)
          ])
          // Excluir apenas reservas canceladas ou já finalizadas
          .neq("status", "cancelled")
          .neq("status", "checkedout")
          .neq("status", "noshow")
          .lte("checkin_date", endDateStr)
          .gte("checkout_date", startDateStr);

        if (reservationsError) throw reservationsError;

        // Buscar quartos bloqueados ou em manutenção (são sempre bloqueados)
        const { data: blockedRooms, error: blockedError } = await supabase
          .from("rooms")
          .select("id")
          .eq("category_id", category.id)
          .in("id", roomIds)
          .in("status", ["blocked", "maintenance"]);

        if (blockedError) throw blockedError;

        const blockedRoomIds = new Set(
          (blockedRooms || []).map((r) => r.id)
        );

        // Para cada data, calcular disponibilidade
        for (const date of dates) {
          const dateStr = format(date, "yyyy-MM-dd");

          // Filtrar reservas ativas para esta data específica
          // Uma reserva está ativa se: checkin_date <= date < checkout_date
          // IMPORTANTE: Considerar TODAS as reservas ativas, independente do pagamento
          // Isso inclui:
          // - Reservas sem pagamento (paid_amount = 0 ou null)
          // - Bloqueios (status = "blocked")
          // - Pré-reservas (status = "preregistration")
          // - Reservas confirmadas mesmo sem pagamento completo
          const activeReservations = (allReservations || []).filter((r) => {
            // Verificar se a reserva está ativa nesta data
            const isActiveOnDate = r.checkin_date <= dateStr && r.checkout_date > dateStr;
            
            // Se não está ativa na data, não considerar
            if (!isActiveOnDate) return false;
            
            // Considerar TODAS as reservas ativas, independente de:
            // - Status de pagamento (paid_amount) - reservas sem pagamento também ocupam
            // - Status da reserva (já filtrado na query acima)
            // - Bloqueios sempre ocupam o quarto
            return true;
          });

          const occupiedRoomIds = new Set(
            activeReservations
              .map((r) => r.room_id)
              .filter((id): id is string => id !== null)
          );

          // Calcular disponibilidade por quarto
          let availableCount = 0;
          for (let i = 0; i < rooms.length; i++) {
            const room = rooms[i];
            const isOccupied = occupiedRoomIds.has(room.id);
            const isBlocked = blockedRoomIds.has(room.id);

            // Quarto disponível se não está ocupado nem bloqueado
            const isAvailable = !isOccupied && !isBlocked ? 1 : 0;
            roomAvailabilities[i].dates[dateStr] = isAvailable;

            if (isAvailable) {
              availableCount++;
            }
          }

          categoryDates[dateStr] = availableCount;
        }

        // Extrair informações do prédio
        const building = (category as any).buildings;
        const buildingName = building && typeof building === 'object' && !Array.isArray(building) 
          ? building.name 
          : null;
        const buildingId = (category as any).building_id || null;

        result.push({
          categoryId: category.id,
          categoryName: category.name,
          buildingId,
          buildingName,
          totalRooms,
          dates: categoryDates,
          rooms: roomAvailabilities,
        });
      }

      return result;
    },
    enabled: !!selectedEstablishment?.id,
  });

  return {
    availability: data || [],
    isLoading,
    error,
  };
};

