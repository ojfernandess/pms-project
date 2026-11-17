function dayEndUtcMs(isoOrDate: string | Date): number {
  const day =
    typeof isoOrDate === "string" ? isoOrDate.slice(0, 10) : isoOrDate.toISOString().slice(0, 10);
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 23, 59, 59, 999);
}

/** Prazo do link de web check-in: fim da estadia (checkout) ou check-in + 30 dias, mínimo 7 dias a partir de agora. */
export function computeWebCheckinExpiresAt(
  checkinDate: string | Date,
  checkoutDate?: string | Date | null
): string {
  const floor = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const chosen = checkoutDate
    ? dayEndUtcMs(checkoutDate)
    : dayEndUtcMs(checkinDate) + 30 * 24 * 60 * 60 * 1000;
  return new Date(Math.max(chosen, floor)).toISOString();
}