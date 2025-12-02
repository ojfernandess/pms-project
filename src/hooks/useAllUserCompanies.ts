import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAllUserCompanies = () => {
  const allUserCompaniesQuery = useQuery({
    queryKey: ["all_user_companies"],
    queryFn: async () => {
      // Buscar todas as associações com dados das empresas e usuários
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select(`
          *,
          companies (*)
        `)
        .order("created_at", { ascending: false });

      if (userCompaniesError) {
        console.error("Erro ao buscar associações:", userCompaniesError);
        throw userCompaniesError;
      }

      if (!userCompanies || userCompanies.length === 0) {
        return [];
      }

      // Buscar dados dos usuários separadamente
      const userIds = [...new Set(userCompanies.map((uc: any) => uc.user_id).filter(Boolean))];
      
      let usersMap: Record<string, { id: string; email: string; full_name: string | null }> = {};
      
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("users")
          .select("id, email, full_name")
          .in("id", userIds);

        if (usersError) {
          console.warn("Erro ao buscar dados dos usuários:", usersError);
        } else if (usersData) {
          usersMap = usersData.reduce((acc, user) => {
            acc[user.id] = user;
            return acc;
          }, {} as Record<string, { id: string; email: string; full_name: string | null }>);
        }
      }

      // Combinar dados
      const associations = userCompanies.map((uc: any) => ({
        ...uc,
        users: usersMap[uc.user_id] || null,
      }));

      return associations;
    },
  });

  return {
    allUserCompanies: allUserCompaniesQuery.data || [],
    isLoading: allUserCompaniesQuery.isLoading,
    refetch: allUserCompaniesQuery.refetch,
  };
};


