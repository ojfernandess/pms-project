/**
 * Nomes de Edge Functions que o proxy (`VITE_SUPABASE_FUNCTIONS_PROXY_URL`) deve encaminhar para o API Node.
 * As restantes continuam em `{VITE_SUPABASE_URL}/functions/v1/...` sem reescrita.
 *
 * Manter alinhado com `server/src/config/nodeFunctionsScope.ts`.
 */
export const NODE_FUNCTIONS_PROXY_NAMES = [
  "health-check",
  "list-channel-templates",
  "send-checkin-charge",
  "process-no-shows",
  "aiosell-reservation-webhook",
  "aiosell-reservations-sync",
  "aiosell-sync",
  "channex-ack-worker",
  "channex-booking-crs-update",
  "channex-mapping-options",
  "channex-reservation-webhook",
  "channex-reservations-sync",
  "channex-sync",
  "rates-dashboard",
  "rates-map",
  "recalc-rates",
] as const;

export const NODE_FUNCTIONS_PROXY_SET = new Set<string>(NODE_FUNCTIONS_PROXY_NAMES);

/** Extrai o nome da função de uma URL …/functions/v1/{name} */
export function extractFunctionsV1Name(urlStr: string): string | null {
  const m = urlStr.match(/\/functions\/v1\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function shouldProxyFunctionsV1Url(urlStr: string): boolean {
  const name = extractFunctionsV1Name(urlStr);
  return name != null && NODE_FUNCTIONS_PROXY_SET.has(name);
}
