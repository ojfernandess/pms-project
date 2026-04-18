/**
 * Debounce para recarregamento de dados tarifários.
 * Evita múltiplos reloads em sequência rápida (ex: alterações em lote).
 */

export const DEFAULT_DEBOUNCE_MS = 500;

/**
 * Retorna uma função debounced. Cada chamada reinicia o timer.
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number = DEFAULT_DEBOUNCE_MS
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}

/**
 * Cria um debouncer que invalida queries após alterações tarifárias.
 * Útil para coalescer invalidações de rate_calendar quando várias mutations completam em sequência.
 */
export function createDebouncedInvalidate(
  invalidate: () => void,
  ms: number = DEFAULT_DEBOUNCE_MS
): () => void {
  return debounce(invalidate, ms);
}
