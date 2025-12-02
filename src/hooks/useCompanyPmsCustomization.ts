import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";

export const useCompanyPmsCustomization = () => {
  const { selectedEstablishment } = useEstablishment();

  const { data, isLoading } = useQuery({
    queryKey: ["companyPmsCustomization", selectedEstablishment?.company_id],
    queryFn: async () => {
      if (!selectedEstablishment?.company_id) return null;

      const { data: company, error } = await supabase
        .from("companies")
        .select("pms_logo_url, pms_custom_name")
        .eq("id", selectedEstablishment.company_id)
        .single();

      if (error) {
        console.error("Erro ao buscar customização do PMS:", error);
        return null;
      }

      return company;
    },
    enabled: !!selectedEstablishment?.company_id,
  });

  // Verificar se há customização real (valores não vazios)
  const hasLogoCustomization = data?.pms_logo_url && data.pms_logo_url.trim() !== "";
  const hasNameCustomization = data?.pms_custom_name && data.pms_custom_name.trim() !== "";
  const hasCustomization = hasLogoCustomization || hasNameCustomization;

  return {
    pmsLogoUrl: hasLogoCustomization ? data.pms_logo_url : null,
    pmsCustomName: hasNameCustomization ? data.pms_custom_name : null,
    hasCustomization,
    isLoading,
  };
};

