# Resiliência da RPC `calculate_rate_price` (PMS)

## Causa raiz de `net::ERR_INSUFFICIENT_RESOURCES`

Em Chromium, o limite clássico de **6 conexões HTTP/1.1 por origem** faz com que muitos `POST` simultâneos para o mesmo host (URL do Supabase) fiquem em fila ou falhem com erros de recurso quando a pressão é alta. O sintoma `net::ERR_INSUFFICIENT_RESOURCES` reflete **esgotamento de recursos do navegador** (sockets, filas internas, buffers), não só “falta de RAM”. Retries agressivos em cima desse erro **pioram** o problema (já evitados em `fetchWithRetry` quando a mensagem indica `insufficient` + `resource`).

## Fluxo implementado (cliente)

Todas as chamadas principais passam por `calculateRatePriceWithResilience` (`src/lib/calculateRatePriceRpc.ts`):

1. **Memoização (TTL 5 min)** — chave estável via `stableSerializeRpcParams` (JSON com campos normalizados).
2. **Deduplicação in-flight** — o mesmo payload em paralelo partilha uma única `Promise` até a RPC terminar.
3. **Semáforo** — no máximo **5** execuções RPC em paralelo (pool lógico por origem para este endpoint).
4. **Janela deslizante** — no máximo **45** inícios de RPC por **10 s** (além do semáforo), para suavizar picos.
5. **Circuit breaker** — **3** falhas consecutivas (após retries internos) abrem o circuito por **30 s**; pedidos entram em **fallback** (`basePrice`) sem novas RPCs.
6. **Backoff exponencial com jitter** — entre tentativas de RPC em erros retriáveis (502/503/504, PGRST301/302, etc.).
7. **Fallback** — `basePrice` opcional (ex.: preço base da categoria em `PublicReservation` / `ratePriceBatch`).

### Integração no PMS

| Área | Uso |
|------|-----|
| `src/utils/ratePriceBatch.ts` | `batchCalculateRatePrice` (motor de reservas / batches) |
| `src/hooks/useRateSystem.ts` | `calculateRatePrice` |
| `src/pages/PublicReservation.tsx` | Cálculos por noite / categoria |

Compatibilidade: contratos públicos (`batchCalculateRatePrice`, retornos de preço) mantêm-se; apenas o transporte interno da RPC mudou.

## Métricas (`getCalculateRatePriceRpcMetrics`)

| Métrica | Significado |
|--------|-------------|
| `totalCalls` | Invocações a `calculateRatePriceWithResilience` |
| `successCount` / `failureCount` | Respostas com `error` null / não-null |
| `cacheHits` | Acertos no cache TTL |
| `rpcCalls` | Chamadas reais `supabase.rpc("calculate_rate_price", …)` |
| `circuitOpenRejections` | Atendidos com circuito aberto (sem nova RPC) |
| `sumLatencyMs` / `avgLatencyMs` | Latência por invocação (inclui espera na fila) |
| `successRate` | `successCount / totalCalls` |
| `approximateCacheMemoryBytes` | Estimativa do Map em memória |
| `maxConcurrentRpcObserved` | Pico observado no semáforo |
| `circuitTrips` | Quantas vezes o circuito abriu |

Para testes: `resetCalculateRatePriceRpcStateForTests()`.

## Testes

`src/lib/calculateRatePriceRpc.test.ts` — inclui **100 chamadas concorrentes** com o mesmo payload (uma RPC), limite de paralelismo com payloads distintos, circuit breaker e cache sequencial.

## Referência

- `src/integrations/supabase/fetchWithRetry.ts` — não retenta `ERR_INSUFFICIENT_RESOURCES` de propósito.
