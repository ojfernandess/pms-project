# Auditoria de performance — criação e cancelamento de reservas

**Data:** 2025-03-19 · **Repositório:** pms-project (branch PMS-Backend)  
**Escopo:** Fase A (diagnóstico) + início Fase C (quick wins). Fases D–E dependem de medição em staging/produção.

---

## Resumo executivo

A lentidão percebida **não está concentrada no RPC `create_reservation_with_lock`** (transação com lock no PostgreSQL). O gargalo principal é o **frontend**: após persistir a reserva, o `onSuccess` do React Query **aguarda** dezenas de chamadas (web check-in, e-mail, WhatsApp/check-in charge, webhooks, logs) **antes** do toast de confirmação.

Cancelamento segue padrão semelhante: `refetch` completo do mapa + finalização OTA + e-mail, tudo `await` no `onSuccess`.

O sync de Channel Manager **não bloqueia** o caminho crítico (`scheduleChannelSyncAfterInventoryChange` é debounced 1,2s e `void`).

---

## Fase A — Mapa de fluxos

### Criação (staff — `useReservations.createReservation`)

| Etapa | Onde | Síncrono? | Notas |
|--------|------|-----------|--------|
| Validação prévia de disponibilidade | `validateRoomAvailability` / `validateCategoryAvailability` | Sim | Redundante com RPC; melhora mensagem de erro |
| Lock + insert | `POST /reservations/lock` → `create_reservation_with_lock` | Sim | **Caminho crítico**; `FOR UPDATE NOWAIT` |
| Re-fetch reserva com joins | Supabase `RESERVATION_RELATIONS_*` | Sim | Necessário para UI |
| Notificação in-app | RPC `create_notification_for_establishment` | Sim (hoje) | Deveria ser assíncrono |
| Web check-in + polling 300ms | `web_checkin` insert | Sim (hoje) | Até 600ms de sleep |
| E-mail `reservation.created` | `triggerEmail` | Sim (hoje) | Pode ser fila |
| Webhook empresa | `call-company-webhook` | Sim (hoje) | HTTP para backend |
| Check-in charge ×2 | `send-checkin-charge` | Sim (hoje) | WhatsApp/e-mail |
| Activity log | `logActivity` | Sim (hoje) | |
| Invalidate + toast | React Query | Sim | Toast **depois** de tudo acima |

### Check-in / check-out (`useReservations.checkIn` / `checkOut`)

| Etapa | Síncrono? | Notas |
|--------|-----------|--------|
| RPC/API `checkInReservation` / `checkOutReservation` | Sim | **Caminho crítico** |
| onSuccess (antes) | `await refetchQueries` ×2 + e-mails + notificação limpeza | Bloqueava mapa e toast |
| onSuccess (agora) | Patch cache + `invalidate` ativo + toast | Integrações em `runAfterCheckIn` / `runAfterCheckOut` |

### Cancelamento (`useReservations.cancelReservation`)

| Etapa | Síncrono? | Notas |
|--------|-----------|--------|
| Load reserva + pagamentos | Sim | |
| Estornos `recordProcessedRefund` | Sim, **sequencial** (N×) | Candidato a `Promise.all` |
| Update `status=cancelled` | Sim | **Caminho crítico** |
| FNRH lifecycle | `void` | OK |
| onSuccess: log, invalidate, **refetch await** | Sim | Refetch duplicado |
| `maybeFinalizeOtaCancellationAfterPmsCancel` | **await** | Integração externa |
| E-mail cancelamento | **await** | |
| Channel sync | Debounced | OK |

### Backend Nest (`reservations.service.createWithLock`)

- Uma query RPC + publish Socket.IO (`RealtimeGateway`). **Leve** frente ao frontend.

### Banco (`create_reservation_with_lock.sql`)

- Lock por quarto/período; índice `idx_reservations_room_active_stay_dates` para conflitos.
- **Não** alterar regras sem medição de planos de execução em produção.

### Integrações síncronas problemáticas (frontend)

- `send-checkin-charge`, `call-company-webhook`, `triggerEmail` no `onSuccess` de create/cancel.
- Channex CRS em alguns updates (`updateReservation`).

### Infra

- Pool Prisma no backend; frontend via PostgREST/Supabase client — latência de rede multiplica N+1.
- BullMQ: lembretes/digest; **não** cobre pós-criação de reserva staff hoje.

---

## Fase B — Priorização (impacto × esforço)

| P | Problema | Causa raiz | Ação |
|---|----------|------------|------|
| P0 | Toast lento após criar/cancelar | `onSuccess` await cadeia longa | Pós-commit assíncrono (`reservationPostCommit`) |
| P0 | Mapa recarrega tudo | `invalidate` + `refetchQueries` | Só `invalidate` com `refetchType: 'active'` |
| P1 | Validação dupla | FE + RPC | Manter FE opcional; documentar |
| P1 | Estornos sequenciais | `for` + await | `Promise.all` com idempotência |
| P2 | Status N+1 em `useReservations` fetch | Loop update por reserva | Batch RPC ou mover para job |
| P2 | CM sync após cada reserva | Vários OTAs | Já debounced; outbox futuro |
| P3 | Instrumentação P95 | Só `monitorOperation` no create | `reservationOperationTrace` + backend spans |

---

## Fases C–E (roadmap)

- **C (concluída nesta entrega):** `reservationPostCommit`, `invalidateReservationViews`, métricas leves, reconcile em lote, `skipPreCreateAvailabilityCheck`.
- **C+ (concluída):** `reservationPaymentStatusReconcile` — updates paralelos (chunks de 8) + debounce 5 min/estabelecimento; taxas pós-create no dialog em background.
- **C++ (concluída nesta entrega):** check-in/check-out — toast imediato; patch incremental no cache (`applyReservationMapDelta`); e-mails, limpeza e avaliação em `reservationPostCheckInOut`; sem `refetchQueries` duplo no mapa.
- **D (concluída nesta entrega):** P95 no cliente (`summarizeReservationTraceRing`, `window.__pmsReservationPerf`); spans check-in/out; log timing Nest `createWithLock`; k6 + script Node para lock RPC — ver [PHASE_D_BENCHMARK.md](./PHASE_D_BENCHMARK.md).
- **E (próxima):** Relatório pós-deploy com números reais; outbox backend para pós-commit.

Metas de referência (UX interna): P95 create/cancel **≤ 1s** no caminho crítico (até toast); integrações em fila **&lt; 30s** P95.

---

## Arquivos tocados (Fase D)

- `src/lib/reservationOperationTrace.ts` — percentis + `__pmsReservationPerf` (dev)
- `src/lib/reservationOperationTrace.test.ts`
- `src/hooks/useReservations.ts` — `checkIn.critical` / `checkOut.critical`
- `backend/src/pms/reservations.service.ts` — timing `createWithLock`
- `docs/performance/PHASE_D_BENCHMARK.md`, `BENCHMARK_RESULTS.md`
- `docs/performance/k6/reservation-lock.js`, `scripts/bench-reservation-lock.mjs`

---

## Arquivos tocados nesta entrega (Fase C / C+ / C++)

- `src/lib/reservationPostCommit.ts` — efeitos colaterais pós-criação/cancelamento
- `src/lib/reservationPostCheckInOut.ts` — pós check-in/out (log, e-mail, limpeza, avaliação)
- `src/lib/reservationQuerySync.ts` — invalidação sem refetch; `upsertReservationInQueryCache` / `applyReservationMapDelta`
- `src/lib/reservationOperationTrace.ts` — spans + ring buffer em sessionStorage
- `src/lib/reservationPaymentStatusReconcile.ts` — reconcile em lote (anti N+1)
- `src/lib/reservationCreateTypes.ts` — `skipPreCreateAvailabilityCheck`
- `src/hooks/useReservations.ts` — caminho crítico, cancel trace, reconcile
- `src/components/reservations/ReservationDialog.tsx` — skip pré-check + taxas async

---

## Regras preservadas

Sem alteração de políticas de cancelamento, tarifário, disponibilidade definitiva (RPC), permissões ou integrações contratuais. Sem cache como fonte de disponibilidade. Sem confirmação otimista antes do lock.