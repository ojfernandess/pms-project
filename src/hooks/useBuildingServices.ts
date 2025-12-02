import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BuildingService {
  id: string;
  building_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export const useBuildingServices = (buildingId: string | null) => {
  const queryClient = useQueryClient();

  // Buscar serviços do prédio
  const { data: services = [], isLoading, refetch } = useQuery({
    queryKey: ["building_services", buildingId],
    queryFn: async () => {
      if (!buildingId) return [];

      const { data, error } = await supabase
        .from("establishment_services")
        .select("*")
        .eq("building_id", buildingId)
        .is("establishment_id", null)
        .order("name", { ascending: true });

      if (error) {
        console.error("Erro ao buscar serviços do prédio:", error);
        return [];
      }

      return (data || []) as BuildingService[];
    },
    enabled: !!buildingId,
  });

  // Criar serviço
  const createService = useMutation({
    mutationFn: async (service: { name: string; description?: string; is_active?: boolean }) => {
      if (!buildingId) throw new Error("Prédio não selecionado");

      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("establishment_services")
        .insert({
          building_id: buildingId,
          establishment_id: null,
          name: service.name,
          description: service.description || null,
          is_active: service.is_active ?? true,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["building_services"] });
      toast.success("Serviço criado com sucesso!");
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast.error("Já existe um serviço com este nome");
      } else {
        toast.error(error.message || "Erro ao criar serviço");
      }
    },
  });

  // Atualizar serviço
  const updateService = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<BuildingService>) => {
      const { data, error } = await supabase
        .from("establishment_services")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["building_services"] });
      toast.success("Serviço atualizado com sucesso!");
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast.error("Já existe um serviço com este nome");
      } else {
        toast.error(error.message || "Erro ao atualizar serviço");
      }
    },
  });

  // Deletar serviço
  const deleteService = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("establishment_services")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["building_services"] });
      toast.success("Serviço removido com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao remover serviço");
    },
  });

  // Salvar múltiplos serviços (para o formulário em lote)
  const saveServices = useMutation({
    mutationFn: async (services: Array<{ id?: string; name: string; description?: string; is_active: boolean }>) => {
      if (!buildingId) throw new Error("Prédio não selecionado");

      const { data: { user } } = await supabase.auth.getUser();

      // Separar serviços para criar e atualizar
      const toCreate = services.filter(s => !s.id);
      const toUpdate = services.filter(s => s.id);

      // Criar novos serviços
      if (toCreate.length > 0) {
        const { error: createError } = await supabase
          .from("establishment_services")
          .insert(
            toCreate.map(service => ({
              building_id: buildingId,
              establishment_id: null,
              name: service.name,
              description: service.description || null,
              is_active: service.is_active,
              created_by: user?.id || null,
            }))
          );

        if (createError) throw createError;
      }

      // Atualizar serviços existentes
      for (const service of toUpdate) {
        const { error: updateError } = await supabase
          .from("establishment_services")
          .update({
            name: service.name,
            description: service.description || null,
            is_active: service.is_active,
          })
          .eq("id", service.id);

        if (updateError) throw updateError;
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["building_services"] });
      toast.success("Serviços salvos com sucesso!");
    },
    onError: (error: any) => {
      if (error.code === "23505") {
        toast.error("Já existe um serviço com este nome");
      } else {
        toast.error(error.message || "Erro ao salvar serviços");
      }
    },
  });

  return {
    services,
    isLoading,
    refetch,
    createService: createService.mutateAsync,
    updateService: updateService.mutateAsync,
    deleteService: deleteService.mutateAsync,
    saveServices: saveServices.mutateAsync,
    isCreating: createService.isPending,
    isUpdating: updateService.isPending,
    isDeleting: deleteService.isPending,
    isSaving: saveServices.isPending,
  };
};




