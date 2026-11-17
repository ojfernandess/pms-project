declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      pmsApiUrl?: string;
      appUrl?: string;
      /** Hostname do domínio dedicado do Web Check-in (ex. checkin.seudominio.com) */
      webCheckinPublicHost?: string;
    };
  }
}

export function resolvePmsApiUrl(): string {
  const runtime = window.__RUNTIME_CONFIG__?.pmsApiUrl?.trim();
  if (runtime) return runtime.replace(/\/$/, "");

  const built = import.meta.env.VITE_PMS_API_URL;
  if (!built) throw new Error("VITE_PMS_API_URL não está configurada");
  return String(built).replace(/\/$/, "");
}

export function resolveAppUrl(): string | null {
  const runtime = window.__RUNTIME_CONFIG__?.appUrl?.trim();
  if (runtime) return runtime.replace(/\/$/, "");

  const built = import.meta.env.VITE_APP_URL;
  if (!built) return null;
  return String(built).replace(/\/$/, "");
}
