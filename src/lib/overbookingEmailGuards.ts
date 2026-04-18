import type { SupabaseClient } from "@supabase/supabase-js";

type ReservationForGuard = {
  id: string;
  establishment_id?: string | null;
  room_id?: string | null;
  checkin_date: string;
  checkout_date: string;
  notes?: string | null;
  pending_resolved_at?: string | null;
};

function dateRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = new Date(bEnd).getTime();
  return bS < aE && bE > aS;
}

/**
 * Bloqueia e-mail de confirmação (payment.confirmed / reservation.created) quando:
 * - há nota de integração de overbooking sem quarto atribuído; ou
 * - há sobreposição de calendário com outra reserva no mesmo quarto.
 * Não bloqueia quando a pendência operacional foi marcada como resolvida (pending_resolved_at)
 * ou quando havia só nota antiga mas já há quarto e não há mais conflito de datas.
 */
export async function shouldBlockGuestConfirmationEmail(
  supabase: SupabaseClient,
  reservation: ReservationForGuard | null | undefined,
): Promise<boolean> {
  if (!reservation?.id) return false;
  if (reservation.pending_resolved_at != null) return false;

  const notes = String(reservation.notes || "").toLowerCase();
  const hasObNote = notes.includes("overbooking");
  if (hasObNote && !reservation.room_id) return true;
  if (!reservation.room_id || !reservation.establishment_id) return false;

  const { data: others } = await supabase
    .from("reservations")
    .select("id, checkin_date, checkout_date, room_id, status")
    .eq("establishment_id", reservation.establishment_id)
    .eq("room_id", reservation.room_id)
    .neq("id", reservation.id)
    .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"]);

  for (const o of others || []) {
    if (
      dateRangesOverlap(
        reservation.checkin_date,
        reservation.checkout_date,
        o.checkin_date,
        o.checkout_date,
      )
    ) {
      return true;
    }
  }
  return false;
}
