import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DailyResultLineConfig } from "@/services/financial/operatingReportService";

export function useFinancialDailyResultLines(companyId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["financial_daily_result_lines", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<DailyResultLineConfig[]> => {
      const { data, error } = await supabase
        .from("financial_daily_result_lines")
        .select("id, label, establishment_ids, display_order, is_unified, is_active")
        .eq("company_id", companyId!)
        .order("display_order", { ascending: true });
      if (error) {
        const msg = String(error.message || "");
        if (msg.includes("financial_daily_result_lines") || error.code === "PGRST205" || error.code === "42P01") {
          return [];
        }
        throw error;
      }
      return (data || []).map((row: any) => ({
        id: row.id,
        label: row.label,
        establishmentIds: row.establishment_ids || [],
        displayOrder: row.display_order ?? 0,
        isUnified: !!row.is_unified,
        isActive: row.is_active !== false,
      }));
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: {
      id?: string;
      label: string;
      establishmentIds: string[];
      displayOrder: number;
      isUnified: boolean;
      isActive: boolean;
    }) => {
      const payload = {
        company_id: companyId,
        label: input.label,
        establishment_ids: input.establishmentIds,
        display_order: input.displayOrder,
        is_unified: input.isUnified,
        is_active: input.isActive,
      };
      if (input.id) {
        const { error } = await supabase.from("financial_daily_result_lines").update(payload).eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("financial_daily_result_lines").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_daily_result_lines", companyId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financial_daily_result_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["financial_daily_result_lines", companyId] });
    },
  });

  return { ...query, upsert, remove };
}

export function defaultDailyLinesFromEstablishments(
  establishments: Array<{ id: string; name: string }>,
): DailyResultLineConfig[] {
  return establishments.map((e, i) => ({
    id: `default-${e.id}`,
    label: e.name,
    establishmentIds: [e.id],
    displayOrder: i,
    isUnified: false,
    isActive: true,
  }));
}
