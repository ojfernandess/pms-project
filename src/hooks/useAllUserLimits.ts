import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserLimit } from "./useUserLimits";

export const useAllUserLimits = () => {
  const userLimitsQuery = useQuery({
    queryKey: ["all_user_limits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_limits")
        .select("*");

      if (error) {
        // Se a tabela não existir, retornar array vazio
        if (error.code === "PGRST116" || error.message?.includes("does not exist")) {
          return [];
        }
        throw error;
      }
      return (data || []) as UserLimit[];
    },
  });

  return {
    allUserLimits: userLimitsQuery.data || [],
    isLoading: userLimitsQuery.isLoading,
    refetch: userLimitsQuery.refetch,
  };
};


