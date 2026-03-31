/** Placeholder cinza: alinhado ao index.html e useSiteMeta (rotas do motor sem favicon de cliente) */
export const NEUTRAL_BOOKING_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23f0f0f0'/%3E%3C/svg%3E";

type CompanyFaviconInput = {
  id?: string;
  booking_engine_favicon?: string | null;
} | null | undefined;

/**
 * Aplica o favicon do motor (empresa) no documento.
 * Cache busting (?v=company_id) alinhado ao SSR (render-html) e ao BookingEnginePage.
 */
export function applyBookingEngineFavicon(company: CompanyFaviconInput): void {
  const raw = company?.booking_engine_favicon?.trim() || null;
  const faviconHref = raw
    ? `${raw}${raw.includes("?") ? "&" : "?"}v=${company?.id ?? "motor"}`
    : null;

  const existingIcons = document.querySelectorAll(
    "link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
  );

  if (!faviconHref) {
    existingIcons.forEach((el) => el.parentNode?.removeChild(el));
    const placeholder = document.createElement("link");
    placeholder.rel = "icon";
    placeholder.href = NEUTRAL_BOOKING_FAVICON;
    document.head.appendChild(placeholder);
    return;
  }

  const currentIcon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
  const currentHref = currentIcon?.getAttribute("href") ?? "";
  if (currentHref === faviconHref) return;

  existingIcons.forEach((el) => el.parentNode?.removeChild(el));
  const newLink = document.createElement("link");
  newLink.rel = "icon";
  newLink.href = faviconHref;
  document.head.appendChild(newLink);
}
