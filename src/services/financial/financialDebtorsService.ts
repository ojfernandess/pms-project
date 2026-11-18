import { supabase } from "@/integrations/supabase/client";

export type FinancialDebtorClient = {
  id: string;
  full_name: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
};

export async function searchEstablishmentClients(
  establishmentId: string,
  search?: string,
  limit = 40,
): Promise<{ success: boolean; data?: FinancialDebtorClient[]; error?: string }> {
  try {
    let q = supabase
      .from("clients")
      .select("id, full_name, document_number, email, phone")
      .eq("establishment_id", establishmentId)
      .order("full_name")
      .limit(limit);

    if (search?.trim()) {
      q = q.ilike("full_name", `%${search.trim()}%`);
    }

    const { data, error } = await q;
    if (error) throw error;
    return { success: true, data: (data || []) as FinancialDebtorClient[] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}