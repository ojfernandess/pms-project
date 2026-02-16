# Motor Persistente de Precificação Dinâmica

## Visão geral

O sistema de precificação dinâmica foi transformado de **simulação visual** para **motor persistente** de nível enterprise.

### Problema anterior
- Regras reprocessadas a cada acesso ao sistema tarifário
- **Cada usuário que entra dispara novo processamento** (calculate_rate_price)
- Logs de execução repetidos
- Preço recalculado em tempo real na tela (bloqueava UI)
- Sem persistência no banco
- Múltiplos usuários disparando processamento
- Risco de reenvio indevido para Channel Manager e OTAs
- Preço dinâmico sobrepunha visualmente a tarifa base

### Solução implementada
- ✔ Regras executam apenas quando necessário (triggers)
- ✔ Preços persistidos em `dynamic_pricing_results`
- ✔ UI carrega instantâneo (lê do banco, não recalcula)
- ✔ Logs apenas em execução de regra, recalc e sync OTA
- ✔ Fila `dynamic_pricing_queue` para processamento assíncrono
- ✔ Badge roxa "Aplicado" com tooltip
- ✔ ARI Grid: Dynamic > Base, sem sobrescrever tarifa base

---

## 1. Persistência (`dynamic_pricing_results`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | PK |
| establishment_id | UUID | Estabelecimento |
| category_id | UUID | Categoria de quarto |
| rate_plan_id | UUID | Plano tarifário |
| date | DATE | Data |
| base_price | DECIMAL | Tarifa base |
| dynamic_adjustment_percent | DECIMAL | Ajuste % aplicado |
| final_price | DECIMAL | Preço final |
| rule_id_applied | UUID | Regra que aplicou (opcional) |
| occupancy_snapshot | JSONB | Ocupação no cálculo |
| pickup_snapshot | JSONB | Pickup no cálculo |
| calculated_at | TIMESTAMPTZ | Primeiro cálculo |
| last_recalculated_at | TIMESTAMPTZ | Último recálculo |
| sync_status_channel_manager | TEXT | pending / synced / failed |
| sync_status_otas | TEXT | pending / synced / failed |

**Constraint:** `(establishment_id, category_id, rate_plan_id, date)` — um resultado por combinação.

---

## 2. Regra não reexecuta ao abrir tela

1. **rates-map** (Edge Function): Se `persist_dynamic_rates === true`, **NUNCA** chama `calculate_rate_price`. Lê exclusivamente de `dynamic_pricing_results` e enriquece `rate_calendar`. Entradas virtuais (Tarifa Base + Flutuação) também vêm de `dynamic_pricing_results` ou base da categoria.
2. **rates-map** (persist=OFF): Calcula em tempo real com Redis (TTL 15 min) para cache compartilhado entre usuários.
3. **RateCalendarGrid**: Detecta `hasEnrichedData` (entradas com `original_base_price`). Não dispara batch de `calculate_rate_price`.
4. **UI**: Exibe badge roxa "Aplicado" quando preço difere da base.

---

## 3. Triggers válidos e fila

### Tabela `dynamic_pricing_queue`

| trigger_type | Quando |
|--------------|--------|
| reservation_created | Nova reserva |
| reservation_cancelled | Cancelamento |
| no_show | No-show |
| inventory_changed | Alteração de inventário |
| rule_changed | Regra criada/alterada/removida |
| manual_recalc | Recalc manual |
| cron | Job agendado |

### Função `enqueue_dynamic_pricing_recalc`

Só enfileira quando `hotel_settings.rate_system_settings.persist_dynamic_rates === true`.

### Triggers criados
- `trg_reservation_insert_dynamic_pricing` — INSERT em `reservations`
- `trg_reservation_update_cancelled_dynamic_pricing` — UPDATE status em `reservations` (cancelled, no_show)
- `trg_dynamic_rule_changed` — INSERT/UPDATE/DELETE em `dynamic_pricing_rules`

---

## 4. Engine Assíncrona (recalc-rates)

**Edge Function:** `recalc-rates`

- Persiste em `dynamic_pricing_results` (não sobrescreve `rate_calendar.base_price`)
- Usa `calculate_rate_price` para obter preço final
- Grava `base_price` (de rate_calendar ou room_categories), `final_price` e `dynamic_adjustment_percent`
- Executada por Cron ou manualmente (`POST /functions/v1/recalc-rates`)

---

## 5. Configuração

### Habilitar persistência

Em **Configurações do Sistema Tarifário**:
- **Persistir Preços Dinâmicos no Banco**: ON

Ou via SQL:

```sql
UPDATE hotel_settings
SET rate_system_settings = jsonb_set(
  COALESCE(rate_system_settings, '{}'),
  '{persist_dynamic_rates}', 'true'
)
WHERE establishment_id = 'UUID_DO_ESTABELECIMENTO';
```

### Chamar recalc-rates

```bash
# Com auth (usuário logado)
curl -X POST "https://SEU_PROJETO.supabase.co/functions/v1/recalc-rates" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json"

# Com parâmetros
?establishment_id=UUID&days_ahead=14
```

---

## 6. Prioridade no ARI Grid

- Se existir preço dinâmico (persistido ou em cache): **Dynamic > Base**
- A tarifa base **não é sobrescrita**; apenas o preço exibido é o final
- `entryWithDynamic = dynamicPrice > 0 ? { ...entry, base_price: dynamicPrice } : entry`

---

## 7. Sincronização Channel Manager

Flags em `dynamic_pricing_results`:
- `sync_status_channel_manager`: `pending` | `synced` | `failed` | `not_configured`
- `sync_status_otas`: idem

**Regra:** enviar apenas quando `final_price` mudou e `sync_status = 'pending'`.

---

## 8. Migrations

| Arquivo | Conteúdo |
|---------|----------|
| `20250215000001_dynamic_pricing_persistence.sql` | `dynamic_pricing_results`, `dynamic_pricing_queue` |
| `20250215000002_dynamic_pricing_triggers.sql` | Triggers e `enqueue_dynamic_pricing_recalc` |

---

## 9. Importante: rates-map deve estar disponível

Quando `persist_dynamic_rates` está ativo, a UI **nunca** chama `calculate_rate_price`. Os preços vêm exclusivamente de:
1. **rates-map** (Edge Function) → lê `dynamic_pricing_results` e enriquece `rate_calendar`
2. Fallback direto ao Supabase → retorna `rate_calendar` cru (sem enriquecimento)

Se a Edge Function **rates-map** não estiver implantada ou falhar (rede, 502), o frontend usa o fallback e exibe apenas tarifas base até que o usuário execute "Recalcular Agora" e a API funcione.

## 10. Fluxo resumido

```
[Reserva/Cancelamento/Regra alterada]
        ↓
enqueue_dynamic_pricing_recalc() → dynamic_pricing_queue
        ↓
Cron ou worker → recalc-rates (Edge Function)
        ↓
calculate_rate_price (RPC) → dynamic_pricing_results
        ↓
rates-map (quando persist) → lê dynamic_pricing_results, enriquece rate_calendar
        ↓
UI: exibe preço final + badge "Aplicado"
```
