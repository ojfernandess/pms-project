import { supabase } from "@/integrations/supabase/client";

export type ReservationRowForReconcile = {
  id: string;
  status: string;
  paid_amount?: number | null;
  total_amount?: number | null;
  reservation_service_fees?: Array<{ amount?: unknown; quantity?: unknown }> | null;
};

const TERMINAL_STATUSES = new Set([
  "blocked",
  "cancelled",
  "checkedin",
  "checkedout",
  "noshow",
  "preregistration",
]);

const RECONCILE_DEBOUNCE_MS = 5 * 60 * 1000;
const UPDATE_CHUNK_SIZE = 8;

function storageKey(establishmentId: string | null | undefined): string {
  return `reservation-payment-status-reconcile:${establishmentId ?? "all"}`;
}

export function shouldRunPaymentStatusReconcile(establishmentId: string | null | undefined): boolean {
  if (typeof sessionStorage === "undefined") return true;
  const key = storageKey(establishmentId);
  const last = Number(sessionStorage.getItem(key) || 0);
  if (last > 0 && Date.now() - last < RECONCILE_DEBOUNCE_MS) return false;
  sessionStorage.setItem(key, String(Date.now()));
  return true;
}

export function computePaymentDerivedStatusUpdates(
  rows: ReservationRowForReconcile[],
): Array<{ id: string; status: string }> {
  const updates: Array<{ id: string; status: string }> = [];

  for (const reservation of rows) {
    if (TERMINAL_STATUSES.has(reservation.status)) continue;

    const paidAmount = Number(reservation.paid_amount || 0);
    const baseTotalAmount = Number(reservation.total_amount || 0);
    const embeddedFees = Array.isArray(reservation.reservation_service_fees)
      ? reservation.reservation_service_fees
      : [];
    const serviceFeesTotal = embeddedFees.reduce(
      (sum, fee) => sum + Number(fee.amount || 0) * Number(fee.quantity || 1),
      0,
    );
    const totalWithFees = baseTotalAmount + serviceFeesTotal;

    let newStatus: string | null = null;

    if (paidAmount === 0) {
      if (reservation.status !== "unpaid" && reservation.status !== "pending") {
        newStatus = "unpaid";
      }
    } else if (paidAmount >= baseTotalAmount && baseTotalAmount > 0) {
      if (serviceFeesTotal > 0 && paidAmount < totalWithFees) {
        if (reservation.status !== "pending") newStatus = "pending";
      } else if (
        reservation.status !== "confirmed" &&
        reservation.status !== "checkedin" &&
        reservation.status !== "checkedout"
      ) {
        newStatus = "confirmed";
      }
    } else if (reservation.status !== "pending") {
      newStatus = "pending";
    }

    if (newStatus) updates.push({ id: reservation.id, status: newStatus });
  }

  return updates;
}

async function applyOneStatusUpdate(update: { id: string; status: string }): Promise<void> {
  const { error } = await supabase.from("reservations").update({ status: update.status }).eq("id", update.id);

  if (!error) return;

  if (
    error.code === "23502" ||
    error.message?.includes("invalid input value") ||
    error.message?.includes("enum")
  ) {
    if (update.status === "unpaid") {
      const { error: fallbackError } = await supabase
        .from("reservations")
        .update({ status: "pending" })
        .eq("id", update.id);
      if (fallbackError) {
        console.warn(`reconcile: fallback pending falhou ${update.id}`, fallbackError);
      }
      return;
    }
  }
  console.warn(`reconcile: status ${update.id}`, error);
}

/** Aplica correções de status derivado de pagamento em lotes paralelos (evita N+1 sequencial). */
export async function applyPaymentDerivedStatusUpdates(
  updates: Array<{ id: string; status: string }>,
): Promise<void> {
  if (updates.length === 0) return;

  const start = performance.now();
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE);
    await Promise.all(chunk.map((u) => applyOneStatusUpdate(u)));
  }
  const ms = Math.round(performance.now() - start);
  if (import.meta.env.DEV) {
    console.info(`[reservation-reconcile] ${updates.length} status update(s) em ${ms}ms`);
  }
}

export async function reconcileLoadedReservationsPaymentStatus(
  rows: ReservationRowForReconcile[],
  establishmentId: string | null | undefined,
): Promise<void> {
  if (!rows.length) return;
  if (!shouldRunPaymentStatusReconcile(establishmentId)) return;

  const updates = computePaymentDerivedStatusUpdates(rows);
  await applyPaymentDerivedStatusUpdates(updates);
}