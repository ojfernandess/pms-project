/**
 * Datas «só dia» vindas do Postgres (YYYY-MM-DD) ou para API.
 * `new Date("2026-04-10")` usa UTC meia-noite → em fusos UTC− o dia civil local fica um dia antes.
 */

export function parseDateOnlyLocal(isoDate: string | null | undefined): Date | undefined {
  if (isoDate == null || String(isoDate).trim() === "") return undefined;
  const part = String(isoDate).slice(0, 10);
  const [y, m, d] = part.split("-").map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return undefined;
  return new Date(y, m - 1, d);
}

export function formatDateOnlyLocal(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}
