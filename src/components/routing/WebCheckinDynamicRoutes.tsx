import { Route } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { getWebCheckinRoutePrefix } from "@/lib/webCheckinPublicUrl";
import WebCheckin from "@/pages/WebCheckin";

/**
 * Rotas adicionais quando web_checkin_public_base_url usa outro path (ex. /Localizador).
 */
export function WebCheckinDynamicRoutes() {
  const { settings } = useSiteSettings();
  const prefix = getWebCheckinRoutePrefix(settings);

  if (!prefix || prefix === "web-checkin") {
    return null;
  }

  return (
    <>
      <Route path={`/${prefix}/:locator`} element={<WebCheckin />} />
      <Route path={`/${prefix}`} element={<WebCheckin />} />
    </>
  );
}