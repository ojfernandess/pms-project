import { supabase } from "@/integrations/supabase/client";

export type FinancialArMigrationPreview = {
  establishment_id: string | null;
  generated_at: string;
  summary: {
    paid_reservation_still_open: number;
    duplicate_reservation_titles: number;
    amount_mismatch: number;
    parking_mirror_titles: number;
    total_issues: number;
  };
  paid_reservation_still_open: unknown[];
  duplicate_reservation_titles: unknown[];
  amount_mismatch: unknown[];
  parking_mirror_titles: unknown[];
};

export async function previewFinancialArMigration(
  establishmentId?: string,
): Promise<{ success: boolean; data?: FinancialArMigrationPreview; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("preview_financial_ar_migration", {
      p_establishment_id: establishmentId ?? null,
    });
    if (error) throw error;
    return { success: true, data: data as FinancialArMigrationPreview };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function applyFinancialArMigration(
  establishmentId: string,
  options?: {
    fixPaidTitles?: boolean;
    fixDuplicates?: boolean;
    resyncReservations?: boolean;
    cancelParkingMirror?: boolean;
  },
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("apply_financial_ar_migration", {
      p_establishment_id: establishmentId,
      p_fix_paid_titles: options?.fixPaidTitles ?? true,
      p_fix_duplicates: options?.fixDuplicates ?? true,
      p_resync_reservations: options?.resyncReservations ?? true,
      p_cancel_parking_mirror: options?.cancelParkingMirror ?? true,
    });
    if (error) throw error;
    return { success: true, data: (data || {}) as Record<string, unknown> };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}