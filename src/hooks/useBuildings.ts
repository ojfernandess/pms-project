import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";

export const useBuildings = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();

  // Buscar prédios
  const buildingsQuery = useQuery({
    queryKey: ["buildings", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id;
      let query = supabase.from("buildings").select("*");
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query.order("name");

      if (error) {
        toast.error("Erro ao carregar prédios");
        throw error;
      }
      return data;
    },
    enabled: !!selectedEstablishment?.id,
  });

  // Criar prédio
  const createBuilding = useMutation({
    mutationFn: async (building: {
      name: string;
      description: string;
      street?: string;
      number?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      country?: string;
      zip_code?: string;
      reception_email?: string;
      booking_engine_link?: string;
      amplifique_token?: string;
      allow_owner_blocking?: boolean;
      is_active?: boolean;
      policies?: any;
    }) => {
      const establishmentId = selectedEstablishment?.id;
      const { data, error } = await supabase
        .from("buildings")
        .insert([{ ...building, establishment_id: establishmentId || undefined }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buildings"] });
      toast.success("Prédio criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar prédio");
    },
  });

  // Atualizar prédio
  const updateBuilding = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("buildings")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buildings"] });
      queryClient.invalidateQueries({ queryKey: ["room_categories"] });
      toast.success("Prédio atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar prédio");
    },
  });

  // Deletar prédio
  const deleteBuilding = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("buildings")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["buildings"] });
      queryClient.invalidateQueries({ queryKey: ["room_categories"] });
      toast.success("Prédio excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir prédio");
    },
  });

  return {
    buildings: buildingsQuery.data || [],
    isLoading: buildingsQuery.isLoading,
    refetch: buildingsQuery.refetch,
    createBuilding: createBuilding.mutateAsync,
    updateBuilding: updateBuilding.mutateAsync,
    deleteBuilding: deleteBuilding.mutateAsync,
    isCreating: createBuilding.isPending,
    isUpdating: updateBuilding.isPending,
  };
};

