export type WebCheckinUrlSiteRow = {
  web_checkin_public_base_url?: string | null;
  pms_base_url?: string | null;
};

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveWebCheckinPublicBase(
  site: WebCheckinUrlSiteRow | null | undefined,
  envFallback?: string,
): string {
  const custom = site?.web_checkin_public_base_url?.trim();
  if (custom) {
    const withScheme = /^https?:\/\//i.test(custom) ? custom : `https://${custom}`;
    return stripTrailingSlashes(withScheme);
  }
  const pms = site?.pms_base_url?.trim();
  const base =
    pms ||
    envFallback?.trim() ||
    Deno.env.get("PUBLIC_APP_URL")?.trim() ||
    Deno.env.get("SITE_URL")?.trim() ||
    Deno.env.get("VITE_APP_URL")?.trim() ||
    "https://localhost";
  return `${stripTrailingSlashes(base)}/web-checkin`;
}

export function buildWebCheckinLocatorUrl(
  locator: string,
  site: WebCheckinUrlSiteRow | null | undefined,
  envFallback?: string,
): string {
  const code = String(locator ?? "").trim();
  if (!code) return "";
  return `${resolveWebCheckinPublicBase(site, envFallback)}/${encodeURIComponent(code)}`;
}