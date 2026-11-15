import { useEffect, useMemo, useState } from "react";
import { parseISO, isValid } from "date-fns";
import { DEFAULT_HOTEL_TZ, formatUtcIsoInHotelTimeZone } from "@/lib/hotelTimezoneDate";

export type PreregistrationExpiryUrgency = "normal" | "warning" | "critical" | "expired" | "none";

function parseExpirationMs(expirationDate: string | null | undefined): number | null {
  if (!expirationDate) return null;
  const parsed = parseISO(expirationDate);
  if (!isValid(parsed)) {
    const fallback = new Date(expirationDate);
    return Number.isNaN(fallback.getTime()) ? null : fallback.getTime();
  }
  return parsed.getTime();
}

export function formatPreregistrationCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function usePreregistrationExpiryCountdown(
  expirationDate: string | null | undefined,
  timeZone: string = DEFAULT_HOTEL_TZ,
) {
  const expiryMs = useMemo(() => parseExpirationMs(expirationDate), [expirationDate]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (expiryMs == null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiryMs]);

  return useMemo(() => {
    if (expiryMs == null) {
      return {
        hasExpiration: false,
        isExpired: false,
        countdownLabel: null as string | null,
        expiresAtLabel: null as string | null,
        urgency: "none" as PreregistrationExpiryUrgency,
        remainingMs: null as number | null,
      };
    }

    const remainingMs = expiryMs - now;
    const isExpired = remainingMs <= 0;
    const expiresAtLabel =
      formatUtcIsoInHotelTimeZone(new Date(expiryMs).toISOString(), timeZone) ?? "";

    let urgency: PreregistrationExpiryUrgency = "normal";
    if (isExpired) {
      urgency = "expired";
    } else if (remainingMs < 60 * 60 * 1000) {
      urgency = "critical";
    } else if (remainingMs < 6 * 60 * 60 * 1000) {
      urgency = "warning";
    }

    return {
      hasExpiration: true,
      isExpired,
      countdownLabel: isExpired ? "00:00:00" : formatPreregistrationCountdown(remainingMs),
      expiresAtLabel,
      urgency,
      remainingMs: Math.max(0, remainingMs),
    };
  }, [expiryMs, now]);
}