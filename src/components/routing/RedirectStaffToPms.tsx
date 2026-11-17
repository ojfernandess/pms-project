import { useEffect } from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { resolveAppUrl } from "@/lib/runtimeConfig";
import { Loader2 } from "lucide-react";

/**
 * No domínio dedicado do Web Check-in, rotas da equipe (login, Super Admin, etc.)
 * redirecionam para a URL Base do PMS.
 */
export function RedirectStaffToPms() {
  const { settings } = useSiteSettings();

  useEffect(() => {
    const base =
      settings?.pms_base_url?.trim().replace(/\/+$/, "") ||
      resolveAppUrl()?.replace(/\/+$/, "") ||
      "";
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const target = base ? `${base}${path.startsWith("/") ? path : `/${path}`}` : null;

    if (target && new URL(target).origin !== window.location.origin) {
      window.location.replace(target);
      return;
    }
    if (base) {
      window.location.replace(`${base}/login`);
    }
  }, [settings?.pms_base_url]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-sm">Redirecionando para o painel do PMS…</p>
    </div>
  );
}