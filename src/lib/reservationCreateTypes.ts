import type { Database } from "@/integrations/supabase/types";

type ReservationInsert = Database["public"]["Tables"]["reservations"]["Insert"];

/** Campos extras só no cliente — removidos antes do RPC de lock. */
export type ReservationCreatePayload = Omit<ReservationInsert, "reservation_code"> & {
  /**
   * Evita `validateRoomAvailability` antes do lock quando o quarto já foi validado no mapa/diálogo.
   * A validação definitiva continua em `create_reservation_with_lock`.
   */
  skipPreCreateAvailabilityCheck?: boolean;
};

export function stripClientOnlyReservationFields<T extends ReservationCreatePayload>(
  payload: T,
): Omit<ReservationInsert, "reservation_code"> {
  const { skipPreCreateAvailabilityCheck: _, ...rest } = payload;
  return rest;
}