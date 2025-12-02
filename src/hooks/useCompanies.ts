import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useCompanies = () => {
  const queryClient = useQueryClient();

  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("name");

      if (error) {
        toast.error("Erro ao carregar empresas");
        throw error;
      }
      return data || [];
    },
  });

  const createCompany = useMutation({
    mutationFn: async (company: {
      name: string;
      cnpj?: string;
      email?: string;
      phone?: string;
      address?: string;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("companies")
        .insert([company])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar empresa");
    },
  });

  const updateCompany = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("companies")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar empresa");
    },
  });

  const deleteCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Empresa excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir empresa");
    },
  });

  return {
    companies: companiesQuery.data || [],
    isLoading: companiesQuery.isLoading,
    refetch: companiesQuery.refetch,
    createCompany: createCompany.mutateAsync,
    updateCompany: updateCompany.mutateAsync,
    deleteCompany: deleteCompany.mutateAsync,
    isCreating: createCompany.isPending,
  };
};

