/**
 * Camada de resiliência para a RPC `calculate_rate_price` (PostgREST/Supabase).
 *
 * Motivação (net::ERR_INSUFFICIENT_RESOURCES):
 * - Navegadores limitam conexões HTTP/1.1 simultâneas por origem (tipicamente 6). Muitos POST
 *   paralelos para o mesmo host (Supabase) saturam sockets e podem esgotar recursos internos,
 *   expondo ERR_INSUFFICIENT_RESOURCES — pressão agregada (sockets + filas), não só “falta de RAM”.
 * - `fetchWithRetry` evita re-tentar esse erro; aqui reduzimos paralelismo, deduplicamos pedidos
 *   idênticos e aplicamos circuit breaker + cache.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_RPC = 5;
const SLIDING_WINDOW_MS = 10_000;
const MAX_RPC_STARTS_PER_WINDOW = 45;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;
const MAX_RPC_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 120;

export interface CalculateRatePriceRpcParams {
  p_establishment_id: string;
  p_category_id: string;
  p_pricing_plan_id: string | null;
  p_date: string;
  p_adults: number;
  p_children: number;
}

export interface CalculateRatePriceRpcResult {
  data: number;
  error: { message: string; code?: string } | null;
  fromCache: boolean;
  fallback: boolean;
}

export interface CalculateRatePriceRpcMetrics {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  cacheHits: number;
  rpcCalls: number;
  circuitOpenRejections: number;
  sumLatencyMs: number;
  avgLatencyMs: number;
  successRate: number;
  cacheEntryCount: number;
  approximateCacheMemoryBytes: number;
  isCircuitOpen: boolean;
  circuitOpenedUntil: number;
  maxConcurrentRpcObserved: number;
  circuitTrips: number;
}

type CacheEntry = { value: number; expiresAt: number };

const priceCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CalculateRatePriceRpcResult>>();

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

const metrics = {
  totalCalls: 0,
  successCount: 0,
  failureCount: 0,
  cacheHits: 0,
  rpcCalls: 0,
  circuitOpenRejections: 0,
  sumLatencyMs: 0,
  circuitTrips: 0,
  maxConcurrentRpcObserved: 0,
};

const windowStarts: number[] = [];

function pruneWindow(now: number): void {
  const cutoff = now - SLIDING_WINDOW_MS;
  while (windowStarts.length > 0 && windowStarts[0]! <= cutoff) {
    windowStarts.shift();
  }
}

async function acquireSlidingWindowSlot(): Promise<void> {
  const spin = async (): Promise<void> => {
    const now = Date.now();
    pruneWindow(now);
    if (windowStarts.length < MAX_RPC_STARTS_PER_WINDOW) {
      windowStarts.push(now);
      return;
    }
    const oldest = windowStarts[0]!;
    const wait = oldest + SLIDING_WINDOW_MS - now + 1;
    await new Promise((r) => setTimeout(r, Math.max(5, wait)));
    return spin();
  };
  await spin();
}

class Semaphore {
  private active = 0;
  private readonly q: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      metrics.maxConcurrentRpcObserved = Math.max(
        metrics.maxConcurrentRpcObserved,
        this.active
      );
      return;
    }
    await new Promise<void>((resolve) => this.q.push(resolve));
    this.active++;
    metrics.maxConcurrentRpcObserved = Math.max(
      metrics.maxConcurrentRpcObserved,
      this.active
    );
  }

  release(): void {
    this.active--;
    const next = this.q.shift();
    if (next) next();
  }
}

const rpcSemaphore = new Semaphore(MAX_CONCURRENT_RPC);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitteredBackoff(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt);
  return Math.floor(base * (0.7 + Math.random() * 0.6));
}

export function stableSerializeRpcParams(p: CalculateRatePriceRpcParams): string {
  const normalized = {
    p_establishment_id: String(p.p_establishment_id),
    p_category_id: String(p.p_category_id),
    p_pricing_plan_id: p.p_pricing_plan_id == null ? null : String(p.p_pricing_plan_id),
    p_date: String(p.p_date),
    p_adults: Math.floor(Number(p.p_adults)),
    p_children: Math.floor(Number(p.p_children)),
  };
  return JSON.stringify(normalized);
}

function isCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

function tripCircuit(): void {
  circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
  consecutiveFailures = 0;
  metrics.circuitTrips++;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
    tripCircuit();
  }
}

function isRetriableRpcError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const m = String(error.message || "").toLowerCase();
  const c = String(error.code || "");
  return (
    m.includes("502") ||
    m.includes("503") ||
    m.includes("504") ||
    m.includes("bad gateway") ||
    m.includes("gateway timeout") ||
    m.includes("timeout") ||
    m.includes("service unavailable") ||
    c === "PGRST301" ||
    c === "PGRST302"
  );
}

export type SupabaseRpcLike = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

function cacheGet(key: string): number | null {
  const e = priceCache.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    priceCache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key: string, value: number): void {
  priceCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function fallbackResult(basePrice: number): CalculateRatePriceRpcResult {
  return {
    data: basePrice,
    error: null,
    fromCache: false,
    fallback: true,
  };
}

async function executeRpcOnce(
  supabase: SupabaseRpcLike,
  params: CalculateRatePriceRpcParams,
  signal: AbortSignal | undefined
): Promise<{ data: unknown; error: { message?: string; code?: string } | null }> {
  if (signal?.aborted) {
    return { data: null, error: { message: "Aborted", code: "ABORT" } };
  }
  metrics.rpcCalls++;
  return supabase.rpc("calculate_rate_price", {
    p_establishment_id: params.p_establishment_id,
    p_category_id: params.p_category_id,
    p_pricing_plan_id: params.p_pricing_plan_id,
    p_date: params.p_date,
    p_adults: params.p_adults,
    p_children: params.p_children,
  });
}

async function executeRpcWithRetries(
  supabase: SupabaseRpcLike,
  params: CalculateRatePriceRpcParams,
  basePrice: number,
  signal: AbortSignal | undefined
): Promise<CalculateRatePriceRpcResult> {
  await acquireSlidingWindowSlot();
  await rpcSemaphore.acquire();
  try {
    let lastError: { message?: string; code?: string } | null = null;

    for (let attempt = 0; attempt < MAX_RPC_ATTEMPTS; attempt++) {
      if (signal?.aborted) {
        recordFailure();
        return fallbackResult(basePrice);
      }

      const { data, error } = await executeRpcOnce(supabase, params, signal);

      if (!error) {
        recordSuccess();
        const n = Number(data ?? 0);
        const price = n > 0 ? n : basePrice;
        return {
          data: price,
          error: null,
          fromCache: false,
          fallback: false,
        };
      }

      lastError = error;
      if (isRetriableRpcError(error) && attempt < MAX_RPC_ATTEMPTS - 1) {
        await sleep(jitteredBackoff(attempt));
        continue;
      }
      break;
    }

    recordFailure();
    return {
      data: basePrice,
      error: lastError,
      fromCache: false,
      fallback: true,
    };
  } finally {
    rpcSemaphore.release();
  }
}

/**
 * RPC `calculate_rate_price` com:
 * - memoização (TTL 5 min), deduplicação in-flight
 * - limite de 5 RPCs concorrentes + janela deslizante
 * - circuit breaker (3 falhas → pausa 30s)
 * - backoff exponencial com jitter nas falhas retriáveis
 */
export async function calculateRatePriceWithResilience(
  supabase: SupabaseRpcLike,
  params: CalculateRatePriceRpcParams,
  options?: {
    basePrice?: number;
    signal?: AbortSignal;
    skipCache?: boolean;
  }
): Promise<CalculateRatePriceRpcResult> {
  const basePrice = Number(options?.basePrice ?? 0);
  const signal = options?.signal;
  const skipCache = options?.skipCache ?? false;

  const key = stableSerializeRpcParams(params);
  const tStart = performance.now();

  metrics.totalCalls++;

  const finish = (result: CalculateRatePriceRpcResult): CalculateRatePriceRpcResult => {
    metrics.sumLatencyMs += performance.now() - tStart;
    if (result.error) {
      metrics.failureCount++;
    } else {
      metrics.successCount++;
    }
    return result;
  };

  if (!skipCache) {
    const cached = cacheGet(key);
    if (cached !== null) {
      metrics.cacheHits++;
      return finish({
        data: cached > 0 ? cached : basePrice,
        error: null,
        fromCache: true,
        fallback: false,
      });
    }
  }

  const existing = inflight.get(key);
  if (existing) {
    return finish(await existing);
  }

  const run = (async (): Promise<CalculateRatePriceRpcResult> => {
    if (signal?.aborted) {
      return fallbackResult(basePrice);
    }

    if (isCircuitOpen()) {
      metrics.circuitOpenRejections++;
      return fallbackResult(basePrice);
    }

    if (!skipCache) {
      const cached2 = cacheGet(key);
      if (cached2 !== null) {
        metrics.cacheHits++;
        return {
          data: cached2 > 0 ? cached2 : basePrice,
          error: null,
          fromCache: true,
          fallback: false,
        };
      }
    }

    try {
      const res = await executeRpcWithRetries(supabase, params, basePrice, signal);
      if (!res.fallback && !res.error && !res.fromCache) {
        cacheSet(key, res.data);
      }
      return res;
    } catch (e) {
      recordFailure();
      const msg = e instanceof Error ? e.message : String(e);
      const isNetwork =
        msg.includes("Failed to fetch") ||
        msg.includes("ERR_INSUFFICIENT_RESOURCES") ||
        msg.includes("502") ||
        msg.includes("NetworkError");

      if (isNetwork && !isCircuitOpen()) {
        await sleep(jitteredBackoff(0));
        if (!signal?.aborted && !isCircuitOpen()) {
          try {
            const retry = await executeRpcWithRetries(supabase, params, basePrice, signal);
            if (!retry.fallback && !retry.error && !retry.fromCache) {
              cacheSet(key, retry.data);
            }
            return retry;
          } catch {
            /* fall through */
          }
        }
      }

      return {
        data: basePrice,
        error: { message: msg },
        fromCache: false,
        fallback: true,
      };
    }
  })();

  inflight.set(key, run);
  run.finally(() => inflight.delete(key));

  return finish(await run);
}

export function getCalculateRatePriceRpcMetrics(): CalculateRatePriceRpcMetrics {
  const total = metrics.totalCalls || 1;
  const avg = metrics.sumLatencyMs / total;
  return {
    totalCalls: metrics.totalCalls,
    successCount: metrics.successCount,
    failureCount: metrics.failureCount,
    cacheHits: metrics.cacheHits,
    rpcCalls: metrics.rpcCalls,
    circuitOpenRejections: metrics.circuitOpenRejections,
    sumLatencyMs: metrics.sumLatencyMs,
    avgLatencyMs: Number.isFinite(avg) ? avg : 0,
    successRate: metrics.successCount / total,
    cacheEntryCount: priceCache.size,
    approximateCacheMemoryBytes: [...priceCache.keys()].reduce(
      (acc, k) => acc + k.length * 2 + 32,
      0
    ),
    isCircuitOpen: isCircuitOpen(),
    circuitOpenedUntil: circuitOpenUntil,
    maxConcurrentRpcObserved: metrics.maxConcurrentRpcObserved,
    circuitTrips: metrics.circuitTrips,
  };
}

export function resetCalculateRatePriceRpcStateForTests(): void {
  priceCache.clear();
  inflight.clear();
  windowStarts.length = 0;
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  metrics.totalCalls = 0;
  metrics.successCount = 0;
  metrics.failureCount = 0;
  metrics.cacheHits = 0;
  metrics.rpcCalls = 0;
  metrics.circuitOpenRejections = 0;
  metrics.sumLatencyMs = 0;
  metrics.circuitTrips = 0;
  metrics.maxConcurrentRpcObserved = 0;
}
