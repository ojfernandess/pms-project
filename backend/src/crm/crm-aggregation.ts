export type ReservationAmountRow = {
  id: string;
  status: string | null;
  total_amount: number | string | null;
  parking_fee?: number | string | null;
  cleaning_fee?: number | string | null;
  service_fee?: number | string | null;
  tourism_tax?: number | string | null;
};

const EXCLUDED_STATUSES = new Set(["cancelled", "no_show", "draft"]);

export function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** LTV = soma de total_amount + taxas oficiais das reservas elegíveis. */
export function computeLtv(reservations: ReservationAmountRow[]): {
  ltv: number;
  stayCount: number;
  averageTicket: number;
  eligibleReservationIds: string[];
} {
  const eligible = reservations.filter((r) => !EXCLUDED_STATUSES.has(String(r.status ?? "")));
  const amounts = eligible.map((r) => {
    return (
      toNumber(r.total_amount) +
      toNumber(r.parking_fee) +
      toNumber(r.cleaning_fee) +
      toNumber(r.service_fee) +
      toNumber(r.tourism_tax)
    );
  });
  const ltv = amounts.reduce((acc, n) => acc + n, 0);
  const stayCount = eligible.length;
  return {
    ltv,
    stayCount,
    averageTicket: stayCount > 0 ? ltv / stayCount : 0,
    eligibleReservationIds: eligible.map((r) => r.id),
  };
}

export function normalizeContactMatchKey(input: {
  email?: string | null;
  phone?: string | null;
  document_number?: string | null;
}): { email: string | null; phone: string | null; document: string | null } {
  const email = input.email?.trim().toLowerCase() || null;
  const phoneDigits = (input.phone || "").replace(/\D/g, "");
  const phone = phoneDigits.length >= 8 ? phoneDigits : null;
  const document = (input.document_number || "").replace(/\D/g, "") || null;
  return { email, phone, document };
}
