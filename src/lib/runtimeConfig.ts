declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      pmsApiUrl?: string;
      appUrl?: string;
      /** true = API no mesmo host do SPA (proxy nginx). false/ausente = subdomínio API (ex. myapi.*). */
      pmsApiSameOrigin?: boolean;
      /** Hostname do domínio dedicado do Web Check-in (ex. checkin.seudominio.com) */
      webCheckinPublicHost?: string;
      /** URL pública do Web Check-in (ex. https://checkin.seudominio.com) */
      webCheckinPublicUrl?: string;
    };
  }
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** Remove www. quando o painel usa o apex (ex.: pms.stayos.com.br sem registro www). */
export function canonicalizePmsApiOrigin(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (u.hostname.toLowerCase().startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    }
    if (typeof window !== "undefined" && window.location.protocol === "https:") {
      u.protocol = "https:";
    }
    return u.origin;
  } catch {
    return trimmed;
  }
}

/** Evita mixed content (HTTPS + http:// na config). */
function alignApiOriginWithPage(apiOrigin: string): string {
  if (typeof window === "undefined") return apiOrigin;
  try {
    const api = new URL(apiOrigin.includes("://") ? apiOrigin : `https://${apiOrigin}`);
    const page = window.location;
    if (page.protocol === "https:" && api.protocol === "http:") {
      api.protocol = "https:";
      return api.origin.replace(/\/$/, "");
    }
    if (normalizeHost(api.hostname) === normalizeHost(page.hostname)) {
      return page.origin.replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return apiOrigin.replace(/\/$/, "");
}

function isLocalDevHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
}

function configuredApiRaw(): string | undefined {
  const runtime = typeof window !== "undefined" ? window.__RUNTIME_CONFIG__?.pmsApiUrl?.trim() : undefined;
  const built = import.meta.env.VITE_PMS_API_URL as string | undefined;
  return runtime || built?.trim() || undefined;
}

function isSameOriginProxyMode(apiOrigin: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.__RUNTIME_CONFIG__?.pmsApiSameOrigin === true) return true;
  if (import.meta.env.VITE_PMS_API_SAME_ORIGIN === "true") return true;
  try {
    const apiHost = normalizeHost(new URL(apiOrigin).hostname);
    const pageHost = normalizeHost(window.location.hostname);
    return apiHost === pageHost;
  } catch {
    return false;
  }
}

/**
 * URL base da API no browser.
 * Modo A (proxy): VITE_PMS_API_URL = URL do SPA (ex. https://pms...).
 * Modo B (StayOS): VITE_PMS_API_URL = https://myapi... (domínio do backend no Dokploy).
 */
export function resolvePmsApiUrl(): string {
  const raw = configuredApiRaw();

  if (typeof window === "undefined") {
    if (!raw) throw new Error("VITE_PMS_API_URL não está configurada");
    return canonicalizePmsApiOrigin(raw);
  }

  if (isLocalDevHost(window.location.hostname)) {
    if (!raw) throw new Error("VITE_PMS_API_URL não está configurada");
    return canonicalizePmsApiOrigin(raw);
  }

  if (!raw) {
    return window.location.origin.replace(/\/$/, "");
  }

  const apiOrigin = canonicalizePmsApiOrigin(raw);

  if (isSameOriginProxyMode(apiOrigin)) {
    return alignApiOriginWithPage(apiOrigin);
  }

  return alignApiOriginWithPage(apiOrigin);
}

export function resolveAppUrl(): string | null {
  const runtime = window.__RUNTIME_CONFIG__?.appUrl?.trim();
  const built = import.meta.env.VITE_APP_URL;
  const raw = runtime || built;
  if (!raw) {
    if (typeof window !== "undefined" && !isLocalDevHost(window.location.hostname)) {
      return window.location.origin.replace(/\/$/, "");
    }
    return null;
  }
  return alignApiOriginWithPage(canonicalizePmsApiOrigin(String(raw)));
}