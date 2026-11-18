import { supabase } from "@/integrations/supabase/client";

export type FinancialSupplier = {
  id: string;
  establishment_id: string;
  name: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  bank_details: Record<string, unknown> | null;
  category: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateSupplierParams = {
  establishment_id: string;
  name: string;
  document_number?: string;
  email?: string;
  phone?: string;
  category?: string;
  notes?: string;
  bank_details?: Record<string, unknown>;
  address?: Record<string, unknown>;
};

export async function listSuppliers(
  establishmentId: string,
  activeOnly = true,
): Promise<{ success: boolean; data?: FinancialSupplier[]; error?: string }> {
  try {
    let q = supabase
      .from("financial_suppliers")
      .select("*")
      .eq("establishment_id", establishmentId)
      .order("name");
    if (activeOnly) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) throw error;
    return { success: true, data: (data || []) as FinancialSupplier[] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function createSupplier(
  params: CreateSupplierParams,
): Promise<{ success: boolean; data?: FinancialSupplier; error?: string }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("financial_suppliers")
      .insert({
        ...params,
        is_active: true,
        created_by: user?.id,
      })
      .select()
      .single();
    if (error) throw error;
    return { success: true, data: data as FinancialSupplier };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function getSupplierById(
  id: string,
): Promise<{ success: boolean; data?: FinancialSupplier; error?: string }> {
  try {
    const { data, error } = await supabase.from("financial_suppliers").select("*").eq("id", id).single();
    if (error) throw error;
    return { success: true, data: data as FinancialSupplier };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function updateSupplier(
  id: string,
  patch: Partial<CreateSupplierParams> & { is_active?: boolean },
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("financial_suppliers")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}