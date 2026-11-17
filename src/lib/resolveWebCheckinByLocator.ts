import { supabase } from "@/integrations/supabase/client";

/** Busca linha web_checkin pelo localizador (maiúsculas/minúsculas) ou código da reserva. */
export async function resolveWebCheckinByLocator(locator: string) {
  const trimmed = locator.trim();
  if (!trimmed) return null;

  for (const loc of [trimmed.toUpperCase(), trimmed]) {
    const { data, error } = await supabase
      .from("web_checkin")
      .select("*")
      .eq("locator", loc)
      .maybeSingle();
    if (error) {
      console.error("Erro ao buscar web_checkin pelo locator:", error);
    }
    if (data) return data;
  }

  for (const code of [trimmed.toUpperCase(), trimmed]) {
    const { data: reservationData, error: reservationError } = await supabase
      .from("reservations")
      .select("id")
      .eq("reservation_code", code)
      .maybeSingle();

    if (!reservationError && reservationData?.id) {
      const { data: byReservation, error: wcError } = await supabase
        .from("web_checkin")
        .select("*")
        .eq("reservation_id", reservationData.id)
        .maybeSingle();
      if (!wcError && byReservation) return byReservation;
    }
  }

  return null;
}