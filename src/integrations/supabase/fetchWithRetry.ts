/**
 * Fetch com retry para falhas transitórias de rede (ex.: ERR_CONNECTION_CLOSED → Failed to fetch).
 * Não altera o comportamento em caso de sucesso; apenas reexecuta a mesma requisição algumas vezes.
 */
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 150;

function isTransientNetworkError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  if (!(error instanceof TypeError)) return false;
  const msg = String(error.message || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed")
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
