/**
 * Base URL da API no browser (Dokploy/Easypanel: nginx faz proxy em /rest, /auth, /functions, /platform-custom-domains).
 * Em produção usa sempre a origem HTTPS da página — ignora http:// embutido no build e runtime-config vazio.
 */
export function browserApiBase(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return window.location.origin.replace(/\/$/, "");
}

export function isLocalDevHostname(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
}