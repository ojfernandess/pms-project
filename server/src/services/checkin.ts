import type { SupabaseClient } from "@supabase/supabase-js";

export async function checkinReserva(
  db: SupabaseClient,
  input: { reservation_id: string; establishment_id: string },
): Promise<void> {
  const { data: row, error: f } = await db
    .from("reservations")
    .select("id, status, establishment_id")
    .eq("id", input.reservation_id)
    .maybeSingle();

  if (f) throw new Error(f.message);
  if (!row) throw new Error("Reserva não encontrada");
  if (String(row.establishment_id) !== input.establishment_id) {
    throw new Error("Reserva não pertence a este estabelecimento");
  }

  const st = String(row.status);
  if (!["pending", "confirmed"].includes(st)) {
    throw new Error(`Check-in não permitido para o estado: ${st}`);
  }

  const { error: u } = await db
    .from("reservations")
    .update({ status: "checkedin", updated_at: new Date().toISOString() })
    .eq("id", input.reservation_id);

  if (u) throw new Error(u.message);
}
