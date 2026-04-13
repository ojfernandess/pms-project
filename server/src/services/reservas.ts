import type { SupabaseClient } from "@supabase/supabase-js";

/** Espelha o objeto `reservationData` enviado a `create_reservation_with_lock` em `useReservations.ts`. */
export type CriarReservaInput = {
  establishment_id: string;
  checkin_date: string;
  checkout_date: string;
  room_id?: string | null;
  category_id?: string | null;
  guest_id?: string | null;
  client_id?: string | null;
  financial_responsible_id?: string | null;
  guest_name?: string | null;
  adults?: number;
  children?: number;
  total_amount?: number;
  paid_amount?: number;
  payment_status?: string;
  status?: string;
  notes?: string | null;
  checkin_time?: string | null;
  checkout_time?: string | null;
  pricing_plan_id?: string | null;
  expiration_date?: string | null;
  channel?: string;
  coupon_id?: string | null;
  created_by?: string | null;
};

function parseRpcResult(data: unknown): { success: boolean; error?: string; reservation_id?: string } {
  let payload: unknown = data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload) as unknown;
    } catch {
      throw new Error("Resposta inválida do RPC create_reservation_with_lock");
    }
  }
  const obj = payload as { success?: boolean; error?: string; reservation_id?: string };
  return {
    success: Boolean(obj?.success),
    error: typeof obj?.error === "string" ? obj.error : undefined,
    reservation_id: typeof obj?.reservation_id === "string" ? obj.reservation_id : undefined,
  };
}

/**
 * Mesmo fluxo do frontend: RPC `create_reservation_with_lock` + leitura da linha com joins usuais.
 */
export async function criarReserva(
  db: SupabaseClient,
  input: CriarReservaInput,
): Promise<{ reservation: Record<string, unknown> }> {
  const p_reservation_data = {
    establishment_id: input.establishment_id,
    room_id: input.room_id ?? null,
    category_id: input.category_id ?? null,
    guest_id: input.guest_id ?? null,
    client_id: input.client_id ?? null,
    financial_responsible_id: input.financial_responsible_id ?? null,
    guest_name: input.guest_name ?? null,
    adults: input.adults ?? 1,
    children: input.children ?? 0,
    total_amount: input.total_amount ?? 0,
    paid_amount: input.paid_amount ?? 0,
    payment_status: input.payment_status ?? "pending",
    status: input.status ?? "pending",
    notes: input.notes ?? null,
    checkin_time: input.checkin_time ?? null,
    checkout_time: input.checkout_time ?? null,
    pricing_plan_id: input.pricing_plan_id ?? null,
    created_by: input.created_by ?? null,
    expiration_date: input.expiration_date ?? null,
    channel: input.channel ?? "direct",
    coupon_id: input.coupon_id ?? null,
  };

  const { data, error } = await db.rpc("create_reservation_with_lock", {
    p_reservation_data,
    p_checkin_date: input.checkin_date,
    p_checkout_date: input.checkout_date,
    p_establishment_id: input.establishment_id,
    p_room_id: input.room_id ?? null,
    p_category_id: input.category_id ?? null,
  });

  if (error) throw new Error(error.message);

  const lockResult = parseRpcResult(data);
  if (!lockResult.success || !lockResult.reservation_id) {
    throw new Error(lockResult.error || "Falha ao criar reserva");
  }

  const { data: reservation, error: fetchError } = await db
    .from("reservations")
    .select(
      `
      *,
      financial_responsible:clients!client_id(*),
      guest:clients!guest_id(*),
      rooms (*),
      room_categories (*)
    `,
    )
    .eq("id", lockResult.reservation_id)
    .single();

  if (fetchError || !reservation) {
    throw new Error(fetchError?.message || "Reserva não encontrada após criação");
  }

  return { reservation: reservation as Record<string, unknown> };
}
