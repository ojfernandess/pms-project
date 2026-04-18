import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useUserCompanies = (userId?: string) => {
  const queryClient = useQueryClient();

  const userCompaniesQuery = useQuery({
    queryKey: ["user_companies", userId],
    queryFn: async () => {
      // Se não passar userId, buscar do usuário logado
      let targetUserId = userId;
      
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.warn("Nenhum usuário logado encontrado");
          return [];
        }
        targetUserId = user.id;
      }

      console.log("Buscando empresas para userId:", targetUserId);

      const { data, error } = await supabase
        .from("user_companies")
        .select("*, companies(*)")
        .eq("user_id", targetUserId);

      if (error) {
        console.error("Erro ao buscar empresas:", error);
        toast.error("Erro ao carregar empresas do usuário");
        throw error;
      }

      console.log("Empresas encontradas:", data);
      return data || [];
    },
    // Sempre habilitado - se não tiver userId, busca do auth
    enabled: true,
    retry: 1,
  });

  const createUserCompany = useMutation({
    mutationFn: async ({
      user_id,
      company_id,
      max_companies,
    }: {
      user_id: string;
      company_id: string;
      max_companies?: number;
    }) => {
      // Construir objeto de insert, incluindo max_companies apenas se fornecido
      const insertData: any = { user_id, company_id };
      if (max_companies !== undefined) {
        insertData.max_companies = max_companies;
      }

      const { data, error } = await supabase
        .from("user_companies")
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_companies"] });
      queryClient.invalidateQueries({ queryKey: ["all_user_companies"] });
      toast.success("Usuário associado à empresa com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao associar usuário à empresa");
    },
  });

  const updateUserCompany = useMutation({
    mutationFn: async ({
      id,
      max_companies,
      is_active,
    }: {
      id: string;
      max_companies?: number;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("user_companies")
        .update({ max_companies, is_active })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_companies"] });
      queryClient.invalidateQueries({ queryKey: ["all_user_companies"] });
      toast.success("Associação atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar associação");
    },
  });

  return {
    userCompanies: userCompaniesQuery.data || [],
    isLoading: userCompaniesQuery.isLoading,
    refetch: userCompaniesQuery.refetch,
    createUserCompany: createUserCompany.mutateAsync,
    updateUserCompany: updateUserCompany.mutateAsync,
    isCreating: createUserCompany.isPending,
  };
};

