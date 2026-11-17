/** Reserva concluída via check-in sem cadastro — não deve ir para guest_stay_history. */
export function readGuestlessCompletedFlag(guestData: unknown): boolean {
  if (!guestData || typeof guestData !== "object" || Array.isArray(guestData)) return false;
  return (guestData as Record<string, unknown>).completed_without_guest_account === true;
}

export const RESERVATION_GUESTLESS_NO_LINK_MESSAGE =
  "Esta reserva foi concluída sem cadastro e não pode ser vinculada a uma conta de hóspede.";

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: { status?: string; guest_data?: unknown; reservation_id?: string } | null }> };
    };
  };
};

export async function isReservationBlockedFromAccountLink(
  supabase: SupabaseLike,
  reservationId?: string,
  locator?: string,
): Promise<boolean> {
  let rid = reservationId;
  if (!rid && locator?.trim()) {
    const { data: byLoc } = await supabase
      .from("web_checkin")
      .select("reservation_id")
      .eq("locator", locator.trim())
      .maybeSingle();
    rid = byLoc?.reservation_id;
  }
  if (!rid) return false;
  const { data: wc } = await supabase
    .from("web_checkin")
    .select("status, guest_data")
    .eq("reservation_id", rid)
    .maybeSingle();
  return wc?.status === "completed" && readGuestlessCompletedFlag(wc.guest_data);
}