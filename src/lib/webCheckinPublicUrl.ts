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

/** Segmento de rota SPA (ex.: web-checkin, Localizador) para rotas alternativas. */
export function getWebCheckinRoutePrefix(settings?: WebCheckinUrlSettings | null): string {
  const custom = settings?.web_checkin_public_base_url?.trim();
  if (!custom) return "web-checkin";
  try {
    const withScheme = /^https?:\/\//i.test(custom) ? custom : `https://${custom}`;
    const pathname = new URL(withScheme).pathname.replace(/^\/+|\/+$/g, "");
    return pathname || "web-checkin";
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