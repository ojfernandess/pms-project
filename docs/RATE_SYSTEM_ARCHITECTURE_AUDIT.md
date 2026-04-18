# Auditoria da Arquitetura do Sistema Tarifário

## Objetivo
Verificar se a implementação para eliminar `ERR_INSUFFICIENT_RESOURCES` foi realizada corretamente.

---

## ✅ 1. Controle de Intervalo de Datas

**Status: IMPLEMENTADO**

- **Arquivo:** `src/lib/rateSystem/calendarRangeUtils.ts`
- **Função:** `getCalendarRange(startDate, endDate)`
- **Limites:** `MAX_DAYS_PER_REQUEST = 31`, `MAX_TOTAL_DAYS_ALLOWED = 93`
- **Comportamento:** Quebra em chunks de 31 dias; se exceder 93 dias totais, retorna `exceedsMaxAllowed: true` e `chunks: []` (query não executa)
- **Integração:** Usado em `useRateSystem` para rate_calendar

---

## ✅ 2. Paginação Supabase

**Status: IMPLEMENTADO**

- **rate_calendar:** `.range(from, from + 1000 - 1)` com loop até `hasMore = false`
- **dynamic_pricing_rules:** `.range(from, from + 1000 - 1)` com loop
- **rate_restrictions:** `.range(from, from + 1000 - 1)` com loop
- **rooms / room_categories:** `.range(0, 999)` em PMSRateSystem

---

## ✅ 3. Request Queue Manager

**Status: IMPLEMENTADO**

- **Arquivo:** `src/lib/rateSystem/requestQueue.ts`
- **Classe:** `RequestQueueService` (singleton via `getRequestQueue()`)
- **Funções:** `addRequest()`, `processNext()` (interno)
- **Concorrência:** `DEFAULT_CONCURRENCY = 3`
- **Integração:** Todas as queries tarifárias (rate_calendar, dynamic_pricing_rules, rate_restrictions, rate_system_settings, rooms) usam a fila

---

## ✅ 4. Lazy Loading por Scroll

**Status: PARCIALMENTE IMPLEMENTADO**

- **Arquivo:** `src/lib/rateSystem/useLazyCalendarRange.ts`
- **Hook:** `useLazyCalendarRange` — gerencia range progressivo (loadRight, loadLeft)
- **Gap:** O hook existe mas **não está integrado** em ARIGrid ou RateCalendarGrid. Os componentes usam `viewDays` fixo (30/60/90) e `dateRange` passado ao useRateSystem.
- **Impacto:** Carregamento por chunks de 31 dias já resolve o pico inicial. Lazy on scroll seria otimização adicional.

---

## ✅ 5. Cache de Sessão

**Status: IMPLEMENTADO**

- **Arquivo:** `src/lib/rateSystem/calendarCache.ts`
- **TTL:** 5 minutos (`CACHE_TTL_MS = 5 * 60 * 1000`)
- **Funções:** `getFromCache()`, `setInCache()`, `invalidateCalendarCache()`
- **Regra:** Cache invalidado em todas as mutations (upsert, create, update, delete de rates, rules, restrictions)
- **Integração:** Usado em useRateSystem antes de cada fetch de rate_calendar

---

## ✅ 6. Materialized View

**Status: CRIADA (não utilizada ainda)**

- **Arquivo:** `supabase/migrations/20250215000004_rate_calendar_materialized_view.sql`
- **View:** `rate_calendar_summary`
- **Campos:** id, establishment_id, rate_plan_id, category_id, date, final_price, availability, restrictions (min_stay, max_stay, etc.)
- **Índices:** PK e índices por establishment_id, date
- **Uso:** A aplicação ainda consulta `rate_calendar`. Para usar a MV: trocar `.from("rate_calendar")` por `.from("rate_calendar_summary")` e configurar `REFRESH MATERIALIZED VIEW CONCURRENTLY` (ex.: via trigger ou job).

---

## ✅ 7. Debounce de Recarregamento

**Status: IMPLEMENTADO**

- **Arquivo:** `src/lib/rateSystem/debounce.ts`
- **Função:** `createDebouncedInvalidate()` — 500ms
- **Uso:** `debouncedCalendarInvalidate` em useRateSystem; chamado após mutations para evitar múltiplos reloads em sequência

---

## ✅ 8. Fallback de Segurança

**Status: IMPLEMENTADO**

- **Comportamento:** Se `exceedsMaxAllowed` ( > 93 dias): query não executa, toast de erro
- **Mensagem:** "Intervalo muito grande (máx. 93 dias) — refine o período."
- **Mensagem alternativa:** Se em lotes mas dentro do limite: "Intervalo grande — carregando em lotes de 31 dias."

---

## ✅ 9. Monitor de Performance

**Status: IMPLEMENTADO**

- **Arquivo:** `src/lib/rateSystem/perfMonitor.ts`
- **Função:** `createPerfMonitor(queryName)` — registra tempo, linhas, memória estimada
- **Logs:** Em DEV ou quando duration > 2000ms ou rows > 1000
- **Uso:** rate_calendar, dynamic_pricing_rules, rate_restrictions

---

## ✅ 10. Carregamento Escalonado (Staggered Load)

**Status: IMPLEMENTADO**

- **Arquivo:** `src/lib/rateSystem/staggeredLoad.ts`
- **Fases:** Phase 1 (400ms) — dynamic_pricing_rules; Phase 2 (700ms) — rate_restrictions
- **Hooks:** `useStaggerPhase1`, `useStaggerPhase2`
- **Uso:** useRateSystem — rate_plans + rate_calendar carregam primeiro; rules e restrictions após os delays

---

## Resultado Esperado

| Objetivo | Status |
|----------|--------|
| Sem ERR_INSUFFICIENT_RESOURCES | ✅ Mitigado (chunks, paginação, fila, cache) |
| Carregamento progressivo | ✅ Chunks + staggered |
| Queries paginadas | ✅ .range() em todas as listagens |
| Baixo consumo de memória | ✅ Paginação + cache com TTL |
| Supabase não sobrecarregado | ✅ Fila + concorrência limitada |
| UI fluida com muitos dias | ✅ Chunks de 31 dias, máx 93 |
| Escalável para múltiplos hotéis | ✅ Cache por establishment |

---

## Recomendações Futuras (Implementadas)

### 1. Integrar useLazyCalendarRange ✅
**Status: IMPLEMENTADO**

- **Arquivos:** `ARIGrid.tsx`, `RateCalendarGrid.tsx`, `useLazyCalendarRange.ts`
- **Comportamento:** O scroll horizontal do calendário dispara `loadRight`/`loadLeft` quando o usuário chega perto da borda (threshold 150px). O hook estende o range carregado em chunks de 31 dias.
- **Detalhes:** `initialWindowDays` configurável (min 31, viewDays); reset automático ao mudar `startDate` ou `viewDays`.

### 2. Usar rate_calendar_summary ✅
**Status: IMPLEMENTADO**

- **Ativação:** `VITE_USE_RATE_CALENDAR_SUMMARY=true` no `.env` ou `useMaterializedView: true` em `useRateSystem`.
- **Leituras:** Quando ativo, as leituras de rate_calendar usam a MV; mapeamento `rate_plan_id`→`pricing_plan_id`, `final_price`→`base_price`.
- **Refresh:** RPC `refresh_rate_calendar_summary` chamado após `upsertRateCalendar` e `bulkUpdateRates` (migration `20250217000003_refresh_rate_calendar_summary_rpc.sql`).

### 3. Ajustar rooms/room_categories ✅
**Status: IMPLEMENTADO**

- **Arquivo:** `PMSRateSystem.tsx`
- **Comportamento:** Busca de `rooms` e `room_categories` em loop paginado (PAGE_SIZE=1000) até `hasMore = false`, permitindo > 1000 registros.
