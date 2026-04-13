import type { SupabaseClient } from "@supabase/supabase-js";

export type DisponibilidadeQuery = {
  establishment_id: string;
  category_id: string;
  checkin_date: string;
  checkout_date: string;
};

/** Quartos da categoria menos os ocupados no intervalo [checkin, checkout). */
export async function disponibilidadePorCategoria(
  db: SupabaseClient,
  q: DisponibilidadeQuery,
): Promise<{ rooms_total: number; busy_rooms: number; available_rooms: number }> {
  const { data: rooms, error: e1 } = await db
    .from("rooms")
    .select("id")
    .eq("establishment_id", q.establishment_id)
    .eq("category_id", q.category_id)
    .or("is_blocked.is.null,is_blocked.eq.false");

  if (e1) throw new Error(e1.message);
  const roomIds = (rooms ?? []).map((r) => r.id as string);
  const rooms_total = roomIds.length;
  if (rooms_total === 0) return { rooms_total: 0, busy_rooms: 0, available_rooms: 0 };

  const { data: busy, error: e2 } = await db
    .from("reservations")
    .select("room_id")
    .eq("establishment_id", q.establishment_id)
    .in("room_id", roomIds)
    .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
    .lt("checkin_date", q.checkout_date)
    .gt("checkout_date", q.checkin_date);

  if (e2) throw new Error(e2.message);

  const distinctBusy = new Set((busy ?? []).map((r) => r.room_id as string).filter(Boolean));
  const busy_rooms = distinctBusy.size;
  return {
    rooms_total,
    busy_rooms,
    available_rooms: Math.max(0, rooms_total - busy_rooms),
  };
}
