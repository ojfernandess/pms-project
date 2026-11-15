const DEFAULT_HOTEL_TZ = "America/Sao_Paulo";

function parseYmdHm(dateYmd: string, timeHm: string) {
  const [year, month, day] = dateYmd.split("-").map(Number);
  const [hours, minutes] = timeHm.split(":").map(Number);
  return { year, month, day, hours, minutes };
}

function wallPartsInZone(utcMs: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(new Date(utcMs));
  const num = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
  return {
    year: num("year"),
    month: num("month"),
    day: num("day"),
    hour: num("hour") % 24,
    minute: num("minute"),
  };
}

/**
 * Converte data/hora «de parede» no fuso do estabelecimento para ISO UTC (TIMESTAMPTZ).
 */
export function zonedLocalDateTimeToUtcIso(
  dateYmd: string,
  timeHm: string,
  timeZone: string = DEFAULT_HOTEL_TZ
): string {
  const { year, month, day, hours, minutes } = parseYmdHm(dateYmd, timeHm);
  if ([year, month, day, hours, minutes].some((n) => Number.isNaN(n))) {
    throw new Error("Data ou hora inválida");
  }

  const tz = timeZone?.trim() || DEFAULT_HOTEL_TZ;
  let utcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);

  for (let i = 0; i < 12; i++) {
    const wall = wallPartsInZone(utcMs, tz);
    if (
      wall.year === year &&
      wall.month === month &&
      wall.day === day &&
      wall.hour === hours &&
      wall.minute === minutes
    ) {
      return new Date(utcMs).toISOString();
    }
    const desired = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
    const current = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0, 0);
    utcMs += desired - current;
  }

  return new Date(utcMs).toISOString();
}

/** Exibe instante UTC no fuso do hotel (rótulo pt-BR). */
export function formatUtcIsoInHotelTimeZone(
  isoUtc: string | null | undefined,
  timeZone: string = DEFAULT_HOTEL_TZ
): string | null {
  if (!isoUtc) return null;
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return null;

  const tz = timeZone?.trim() || DEFAULT_HOTEL_TZ;
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} às ${get("hour")}:${get("minute")}`;
}

export { DEFAULT_HOTEL_TZ };