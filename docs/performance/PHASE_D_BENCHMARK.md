# Fase D — medição e carga (reservas)

Objetivo: comparar **P95 do caminho crítico no browser** com **P95 do lock no backend**, antes/depois das otimizações de UI (fases C–C++).

Meta de referência (UX staff): **P95 ≤ 1000 ms** em `*.critical` até o toast — medido no cliente.  
Meta backend (só RPC lock): **P95 ≤ 500–800 ms** em staging (depende de rede/DB).

---

## 1. Browser — ring buffer (`sessionStorage`)

Em **dev**, após criar/cancelar/check-in/check-out:

1. Abra o DevTools → Console.
2. Execute:

```js
__pmsReservationPerf.report()
// ou tabela:
console.table(__pmsReservationPerf.summarize())
```

Operações registradas:

| Span | Significado |
|------|-------------|
| `createReservation.critical` | Lock + fetch pós-insert (mutationFn) |
| `cancelReservation.critical` | Cancelamento até persistir |
| `checkIn.critical` / `checkOut.critical` | API Nest check-in/out |

Limpar amostras: `__pmsReservationPerf.clear()`.

Copie a saída de `report()` para [BENCHMARK_RESULTS.md](./BENCHMARK_RESULTS.md).

---

## 2. Backend — log do Nest

`ReservationsService.createWithLock` registra duração quando:

- latência **≥ 400 ms**, ou
- `PMS_LOG_RESERVATION_LOCK_TIMING=1` (loga todas).

Procure no log: `createWithLock 123ms success=true establishment=...`

---

## 3. Carga k6 (recomendado em staging)

Pré-requisitos: [k6](https://k6.io/docs/get-started/installation/) instalado; estabelecimento de **teste** com categoria (e opcionalmente quarto).

```powershell
$env:PMS_API_URL="https://staging-api.example.com"
$env:PMS_ESTABLISHMENT_ID="<uuid>"
$env:PMS_CATEGORY_ID="<uuid>"
$env:PMS_VUS="15"
$env:PMS_DURATION="45s"
k6 run docs/performance/k6/reservation-lock.js
```

Modos:

| `PMS_BENCH_MODE` | Uso |
|------------------|-----|
| `throughput` (default) | Datas distintas por VU — mede vazão |
| `contention` | Mesmo período/quarto — mede lock/conflito |

**Atenção:** reservas de benchmark usam datas em 2030 e guest `k6-bench-*` — limpe periodicamente no ambiente de teste.

---

## 4. Script Node (sem k6)

```powershell
$env:PMS_API_URL="http://localhost:3000"
$env:PMS_ESTABLISHMENT_ID="<uuid>"
$env:PMS_CATEGORY_ID="<uuid>"
$env:PMS_BENCH_ITERATIONS="30"
$env:PMS_BENCH_CONCURRENCY="6"
node docs/performance/scripts/bench-reservation-lock.mjs
```

---

## 5. Roteiro comparativo (antes vs depois)

1. Limpe o ring: `__pmsReservationPerf.clear()`.
2. Execute **10×** criar reserva (mesmo fluxo staff) e **10×** cancelar (sem estorno, se possível).
3. `console.table(__pmsReservationPerf.summarize())` → registre P95.
4. Rode k6 ou script Node no mesmo ambiente.
5. Repita após deploy das fases C++.

---

## 6. Próxima fase (E)

- Outbox backend para pós-commit (e-mail/webhook) e relatório pós-deploy com números reais de produção (amostragem + traces agregados).