import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DashboardEstablishment = {
  id: string;
  name: string;
  type: string;
  establishment_type?: string | null;
  is_active: boolean | null;
  company_id: string;
  numeric_id: number;
  slug?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  logo_url?: string | null;
  photo_url?: string | null;
};

export function useAccessibleEstablishments(params: {
  companyIds: string[];
  employeeEstablishmentIds: Set<string>;
  isEmployee: boolean;
  enabled: boolean;
}) {
  const { companyIds, employeeEstablishmentIds, isEmployee, enabled } = params;

  return useQuery({
    queryKey: ["dashboard_establishments", [...companyIds].sort().join(","), isEmployee],
    enabled: enabled && companyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishments")
        .select(
          `
          id, name, type, establishment_type, is_active, company_id, numeric_id, slug, address,
          hotel_settings ( city, state, logo_url, photo_url )
        `,
        )
        .in("company_id", companyIds)
        .order("name");

      if (error) throw error;

      const rows = (data || []) as any[];
      const mapped: DashboardEstablishment[] = rows.map((row) => {
        const hs = Array.isArray(row.hotel_settings) ? row.hotel_settings[0] : row.hotel_settings;
        return {
          id: row.id,
          name: row.name,
          type: row.type || row.establishment_type || "hotel",
          establishment_type: row.establishment_type,
          is_active: row.is_active,
          company_id: row.company_id,
          numeric_id: row.numeric_id,
          slug: row.slug,
          address: row.address,
          city: hs?.city || null,
          state: hs?.state || null,
          logo_url: hs?.logo_url || null,
          photo_url: hs?.photo_url || null,
        };
      });

      if (isEmployee) {
        return mapped.filter((e) => employeeEstablishmentIds.has(e.id));
      }
      return mapped;
    },
    staleTime: 30_000,
  });
}