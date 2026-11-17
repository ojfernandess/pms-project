declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      pmsApiUrl?: string;
      appUrl?: string;
      /** Hostname do domínio dedicado do Web Check-in (ex. checkin.seudominio.com) */
      webCheckinPublicHost?: string;
      /** URL pública do Web Check-in (ex. https://checkin.seudominio.com) */
      webCheckinPublicUrl?: string;
    };
  }
}

function checkinHostFromRuntime(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.__RUNTIME_CONFIG__?.webCheckinPublicHost?.trim();
  if (raw) return raw.toLowerCase().replace(/^www\./, "");
  const url = window.__RUNTIME_CONFIG__?.webCheckinPublicUrl?.trim();
  if (url) {
    try {
      const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      /* ignore */
    }
  }
  const vite = (import.meta.env.VITE_WEB_CHECKIN_PUBLIC_HOST as string | undefined)?.trim();
  if (vite) return vite.toLowerCase().replace(/^www\./, "");
  return null;
}

/** Vhost checkin.* no mesmo frontend nginx — API via mesma origem (/rest, /functions). */
function shouldUseCheckinSameOriginApi(pmsApiOrigin: string): boolean {
  if (typeof window === "undefined") return false;
  const current = window.location.hostname.toLowerCase().replace(/^www\./, "");
  const checkin = checkinHostFromRuntime();
  if (checkin && current === checkin) return true;

  try {
    const apiHost = new URL(
      pmsApiOrigin.includes("://") ? pmsApiOrigin : `https://${pmsApiOrigin}`,
    ).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    if (current === apiHost) return false;
    const apex = (h: string) => {
      const parts = h.split(".");
      return parts.length >= 2 ? parts.slice(-2).join(".") : h;
    };
    return apex(current) === apex(apiHost) && current !== apiHost;
  } catch {
    return false;
  }
}

/** Remove www. quando o painel usa o apex (ex.: pms.stayos.com.br sem registro www). */
export function canonicalizePmsApiOrigin(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (u.hostname.toLowerCase().startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    }
    return u.origin;
  } catch {
    return trimmed;
  }
}

export function resolvePmsApiUrl(): string {
  const runtime = window.__RUNTIME_CONFIG__?.pmsApiUrl?.trim();
  const built = import.meta.env.VITE_PMS_API_URL;
  const raw = runtime || built;
  if (!raw) throw new Error("VITE_PMS_API_URL não está configurada");
  const apiOrigin = canonicalizePmsApiOrigin(String(raw));

  if (typeof window !== "undefined" && shouldUseCheckinSameOriginApi(apiOrigin)) {
    return window.location.origin.replace(/\/$/, "");
  }

  return apiOrigin;
}

export function resolveAppUrl(): string | null {
  const runtime = window.__RUNTIME_CONFIG__?.appUrl?.trim();
  if (runtime) return runtime.replace(/\/$/, "");

  const built = import.meta.env.VITE_APP_URL;
  if (!built) return null;
  return String(built).replace(/\/$/, "");
}
