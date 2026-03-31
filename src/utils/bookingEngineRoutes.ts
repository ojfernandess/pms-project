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

/**
 * Indica se a rota atual é do motor de reservas (não injetar favicon/meta do PMS).
 *
 * **Importante:** `"/"` é considerado motor porque, neste app, a raiz só existe como
 * `CustomDomainDetector` na raiz (domínio personalizado → motor). Sem isso,
 * `useSiteMeta` aplicava o favicon do SuperAdmin antes do ícone da empresa — duplicando loads.
 */
export function isBookingEngineRoute(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (p === "/" || p === "") {
    return true;
  }
  return BOOKING_ENGINE_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
}
