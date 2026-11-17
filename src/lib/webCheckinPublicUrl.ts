export type WebCheckinUrlSettings = {
  web_checkin_public_base_url?: string | null;
  pms_base_url?: string | null;
};

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Base usada nos links externos (e-mail, API, copiar link). Sem localizador no final.
 * Padrão: {pms_base_url ou origin}/web-checkin
 */
export function resolveWebCheckinPublicBase(
  settings?: WebCheckinUrlSettings | null,
  fallbackOrigin?: string,
): string {
  const custom = settings?.web_checkin_public_base_url?.trim();
  if (custom) {
    const withScheme = /^https?:\/\//i.test(custom) ? custom : `https://${custom}`;
    return stripTrailingSlashes(withScheme);
  }
  const pms = settings?.pms_base_url?.trim();
  const origin =
    pms ||
    fallbackOrigin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${stripTrailingSlashes(origin)}/web-checkin`;
}

export function buildWebCheckinLocatorUrl(
  locator: string,
  settings?: WebCheckinUrlSettings | null,
  fallbackOrigin?: string,
): string {
  const code = String(locator ?? "").trim();
  if (!code) return "";
  return `${resolveWebCheckinPublicBase(settings, fallbackOrigin)}/${encodeURIComponent(code)}`;
}

function hostnameFromUrlOrHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return trimmed.toLowerCase().replace(/^www\./, "").split("/")[0] || null;
  }
}

/** Hostname de env/runtime (painel de hospedagem), usado antes de site_settings carregar. */
export function getRuntimeWebCheckinPublicHostname(): string | null {
  if (typeof window === "undefined") return null;
  const raw =
    window.__RUNTIME_CONFIG__?.webCheckinPublicHost?.trim() ||
    (import.meta.env.VITE_WEB_CHECKIN_PUBLIC_HOST as string | undefined)?.trim() ||
    "";
  return hostnameFromUrlOrHost(raw);
}

/** Hostname configurado em site_settings ou WEB_CHECKIN_PUBLIC_HOST (sem www). */
export function getWebCheckinPublicHostname(settings?: WebCheckinUrlSettings | null): string | null {
  const custom = settings?.web_checkin_public_base_url?.trim();
  if (custom) {
    const h = hostnameFromUrlOrHost(custom);
    if (h) return h;
  }
  return getRuntimeWebCheckinPublicHostname();
}

/** O visitante está no domínio dedicado do Web Check-in (ex.: checkin.seudominio.com). */
export function isWebCheckinPublicHostname(settings?: WebCheckinUrlSettings | null): boolean {
  if (typeof window === "undefined") return false;
  const configured = getWebCheckinPublicHostname(settings);
  if (!configured) return false;
  // settings ainda carregando: reconhecer host só via env evita 404 de rota no domínio checkin
  const current = window.location.hostname.toLowerCase().replace(/^www\./, "");
  return current === configured;
}

/**
 * Segmento de rota SPA quando o check-in usa subcaminho no mesmo host do PMS.
 * Retorna "" quando a base é só o domínio (localizador na raiz: /RSV123).
 * Retorna "web-checkin" no padrão do PMS.
 */
export function getWebCheckinRoutePrefix(settings?: WebCheckinUrlSettings | null): string {
  const custom = settings?.web_checkin_public_base_url?.trim();
  if (!custom) return "web-checkin";
  try {
    const withScheme = /^https?:\/\//i.test(custom) ? custom : `https://${custom}`;
    const pathname = new URL(withScheme).pathname.replace(/^\/+|\/+$/g, "");
    return pathname || "";
  } catch {
    return "web-checkin";
  }
}

/** Reset de senha do hóspede permanece no app PMS (/web-checkin/reset-password). */
export function buildWebCheckinResetPasswordUrl(
  token: string,
  settings?: WebCheckinUrlSettings | null,
  fallbackOrigin?: string,
): string {
  const pms = settings?.pms_base_url?.trim();
  const origin =
    pms ||
    fallbackOrigin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const base = stripTrailingSlashes(origin);
  return `${base}/web-checkin/reset-password?token=${encodeURIComponent(token)}`;
}