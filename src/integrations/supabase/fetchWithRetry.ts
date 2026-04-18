/**
 * Fetch com retry para falhas transitórias de rede e gateway (502/503/504).
 *
 * Quando o Supabase devolve 502 sem cabeçalhos CORS na página de erro, o browser
 * pode expor "CORS" / Failed to fetch — o problema real costuma ser 502/timeout no upstream,
 * não a configuração de CORS do projeto.
 */
const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 250;

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (!(error instanceof TypeError)) return false;
  const msg = String(error.message || "").toLowerCase();
  /** Retries agravam net::ERR_INSUFFICIENT_RESOURCES (demasiadas ligações). */
  if (msg.includes("insufficient") && msg.includes("resource")) return false;
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    msg.includes("err_failed") ||
    msg.includes("err_network")
  );
}

function isRetryableHttpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(input, init);
      if (isRetryableHttpStatus(response.status) && attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
        continue;
      }
      return response;
    } catch (e) {
      lastError = e;
      if (!isTransientNetworkError(e) || attempt === MAX_ATTEMPTS) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * Math.pow(2, attempt - 1)));
    }
  }
  throw lastError;
};
