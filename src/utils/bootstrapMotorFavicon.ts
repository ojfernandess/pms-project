import { isBookingEngineRoute } from "@/utils/bookingEngineRoutes";

/**
 * Executado o mais cedo possível no boot (main.tsx), antes do React.
 * Nas rotas do motor, remove qualquer `<link rel="icon">` herdado do HTML estático
 * para evitar o primeiro fetch do placeholder / favicon genérico antes da aplicação
 * do ícone configurado em `companies.booking_engine_favicon`.
 */
export function stripStaticFaviconLinksOnMotorBoot(): void {
  if (typeof document === "undefined") return;
  if (!isBookingEngineRoute(window.location.pathname)) return;

  document
    .querySelectorAll(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
    )
    .forEach((el) => el.remove());
}
