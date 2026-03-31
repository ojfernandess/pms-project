/**
 * Prefixos de pathname tratados como “motor de reservas” (white-label).
 * Manter alinhado com {@link isBookingEngineRoute}.
 */
export const BOOKING_ENGINE_PATH_PREFIXES = [
  "/motor",
  "/reservar",
  "/categoria",
  "/reserva",
  "/politica",
] as const;

export function isBookingEngineRoute(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return BOOKING_ENGINE_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
}
