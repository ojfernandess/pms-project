import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentEmployeeRole } from "./useEmployees";
import { useEstablishment } from "@/contexts/EstablishmentContext";

/**
 * Hook para verificar se o usuário atual é um proprietário
 * e obter os quartos que pertencem a ele
 */
export const useOwner = () => {
  const { role } = useCurrentEmployeeRole();
  const { selectedEstablishment } = useEstablishment();
  const isOwner = role?.code === "owner";

  // Buscar quartos do proprietário
  const { data: ownerRooms = [], isLoading: isLoadingRooms } = useQuery({
    queryKey: ["owner_rooms", selectedEstablishment?.id],
    queryFn: async () => {
      if (!isOwner) return [];

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Buscar quartos onde o usuário é o proprietário no estabelecimento atual
      let query = supabase
        .from("rooms")
        .select(`
          *,
          room_categories (*)
        `)
        .eq("owner_user_id", user.id);

      // Filtrar por estabelecimento se disponível
      if (selectedEstablishment?.id) {
        query = query.eq("establishment_id", selectedEstablishment.id);
      }

      const { data, error } = await query.order("room_number");

      if (error) {
        console.error("Erro ao buscar quartos do proprietário:", error);
        return [];
      }

      return data || [];
    },
    enabled: isOwner && !!selectedEstablishment?.id,
  });

  // Obter IDs dos quartos do proprietário
  const ownerRoomIds = ownerRooms.map((room: any) => room.id);

  return {
    isOwner,
    ownerRooms,
    ownerRoomIds,
    isLoadingRooms,
  };
};

