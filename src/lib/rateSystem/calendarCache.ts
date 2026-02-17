/**
 * Cache de sessão para dados do calendário tarifário.
 * Evita requisições repetidas para o mesmo período.
 */

import { format } from "date-fns";
import type { DateRange } from "./calendarRangeUtils";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const CACHE_KEY_PREFIX = "rate_calendar_cache:";

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

function cacheKey(establishmentId: string, range: DateRange, suffix = ""): string {
  const start = format(range.start, "yyyy-MM-dd");
  const end = format(range.end, "yyyy-MM-dd");
  return `${CACHE_KEY_PREFIX}${establishmentId}:${start}:${end}${suffix ? `:${suffix}` : ""}`;
}

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS;
}

/** Armazenamento em memória (por sessão) */
const memoryCache = new Map<string, CacheEntry<unknown>>();

export function getFromCache<T>(
  establishmentId: string,
  range: DateRange,
  suffix?: string
): T | null {
  const key = cacheKey(establishmentId, range, suffix);
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry || isExpired(entry)) {
    if (entry) memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setInCache<T>(
  establishmentId: string,
  range: DateRange,
  data: T,
  suffix?: string
): void {
  const key = cacheKey(establishmentId, range, suffix);
  memoryCache.set(key, { data, fetchedAt: Date.now() });
}

/**
 * Invalida todo o cache do calendário tarifário para um establishment.
 * Chamar após alterações em rate_calendar, dynamic_pricing_rules ou rate_restrictions.
 */
export function invalidateCalendarCache(establishmentId?: string): void {
  if (!establishmentId) {
    memoryCache.clear();
    return;
  }
  const prefix = `${CACHE_KEY_PREFIX}${establishmentId}`;
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}
