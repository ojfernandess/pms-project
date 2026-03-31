/**
 * @module bookingEngineFavicon
 *
 * Favicon exclusivo do motor de reservas (white-label): uma única requisição HTTP
 * ao asset configurado em `companies.booking_engine_favicon`, sem placeholder cinza,
 * sem favicon do PMS e sem ícone padrão como fallback quando o cliente não configurou
 * ou a URL é inválida (aba sem ícone até nova tentativa).
 *
 * @see docs/motor-booking-favicon.md
 */

export type MotorFaviconApplyResult =
  | { status: "applied"; href: string; linkCount: number }
  | { status: "noop"; href: string; reason: "already_applied"; linkCount: number }
  | {
      status: "cleared";
      reason: "no_client_config" | "invalid_url";
      linkCount: number;
    };

type CompanyFaviconInput = {
  id?: string;
  booking_engine_favicon?: string | null;
} | null | undefined;

/** Estado de sessão para idempotência (Strict Mode / re-renders) */
let lastAppliedMotorHref: string | null = null;

const SELECTOR =
  'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]';

const DATA_ATTR = "data-motor-booking-favicon";

/** Apenas para testes — zera estado de idempotência */
export function __resetMotorFaviconStateForTests(): void {
  lastAppliedMotorHref = null;
}

export function countFaviconLinkElements(doc: Document = document): number {
  return doc.querySelectorAll(SELECTOR).length;
}

export function removeAllFaviconLinks(doc: Document = document): void {
  doc.querySelectorAll(SELECTOR).forEach((el) => el.remove());
}

/**
 * Aceita URLs absolutas, relativas ao site, `data:image/...` e `//host/...`.
 */
export function isValidClientMotorFaviconUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (t.startsWith("data:image/")) return true;
  if (t.startsWith("/")) return true;
  if (t.startsWith("//")) return true;
  if (/^https?:\/\//i.test(t)) return true;
  return false;
}

function normalizeClientFaviconUrl(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("//")) {
    return `${typeof window !== "undefined" ? window.location.protocol : "https:"}${t}`;
  }
  return t;
}

function buildHrefWithCacheBust(raw: string, companyId: string | undefined): string {
  const base = normalizeClientFaviconUrl(raw);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${companyId ?? "motor"}`;
}

/**
 * Aplica **exatamente um** `<link rel="icon">` para o motor de reservas, conforme a empresa.
 * Remove todos os ícones existentes (incl. apple-touch) antes de inserir o do cliente.
 *
 * - Sem `booking_engine_favicon` ou URL inválida: remove todos os links — **nenhum** fallback.
 * - Mesma URL já aplicada: não altera o DOM (noop).
 *
 * Erros de rede no ícone do cliente não são tratados aqui (o browser exibe ícone quebrado ou genérico da aba);
 * não se carrega favicon do sistema como substituto.
 */
export function applyMotorBookingEngineFavicon(
  company: CompanyFaviconInput
): MotorFaviconApplyResult {
  const raw = company?.booking_engine_favicon?.trim() ?? "";

  if (!raw) {
    removeAllFaviconLinks();
    lastAppliedMotorHref = null;
    const n = countFaviconLinkElements();
    return { status: "cleared", reason: "no_client_config", linkCount: n };
  }

  if (!isValidClientMotorFaviconUrl(raw)) {
    removeAllFaviconLinks();
    lastAppliedMotorHref = null;
    const n = countFaviconLinkElements();
    return { status: "cleared", reason: "invalid_url", linkCount: n };
  }

  const href = buildHrefWithCacheBust(raw, company?.id);

  if (lastAppliedMotorHref === href) {
    return {
      status: "noop",
      href,
      reason: "already_applied",
      linkCount: countFaviconLinkElements(),
    };
  }

  removeAllFaviconLinks();

  const link = document.createElement("link");
  link.rel = "icon";
  link.href = href;
  link.setAttribute(DATA_ATTR, "1");
  document.head.appendChild(link);

  lastAppliedMotorHref = href;

  return {
    status: "applied",
    href,
    linkCount: countFaviconLinkElements(),
  };
}

/**
 * @deprecated Use `applyMotorBookingEngineFavicon`. Mantido para imports legados.
 */
export function applyBookingEngineFavicon(company: CompanyFaviconInput): void {
  applyMotorBookingEngineFavicon(company);
}

/** @deprecated Não usar no motor — placeholder removido por requisito de produto */
export const NEUTRAL_BOOKING_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23f0f0f0'/%3E%3C/svg%3E";
