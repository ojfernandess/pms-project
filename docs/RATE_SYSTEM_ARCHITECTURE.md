# Arquitetura do Sistema Tarifário — PMS Profissional

## Visão Geral

O sistema tarifário foi evoluído para operar de forma **sincronizada**, **em tempo real** e **escalável**, integrando:

- Dashboard de Preços
- Mapa de Tarifas (RateCalendarGrid)
- Grade ARI (Availability, Restrictions, Inventory)
- Planos Tarifários
- Regras Dinâmicas
- Restrições
- Motor de Reservas e Reservas Públicas

---

## 1. Carregamento Resiliente

### Configuração de Retry e Refetch

**`useRateSystem.ts`** e **`PriceDashboardView.tsx`** utilizam:

- **Retry**: 3 tentativas com backoff exponencial (1s, 2s, 4s)
- **Refetch on Window Focus**: Recarrega dados ao retornar à aba/janela
- **Stale Time**: 60 segundos para cache otimizado

### Skeleton Loading

- **PriceDashboardView**: Cards animados e indicador de carregamento durante o fetch inicial

---

## 2. Sincronização em Tempo Real (Supabase Realtime)

### Hook `useRateSystemRealtime`

Subscreve alterações em:

- `rate_calendar`
- `dynamic_pricing_rules`
- `rate_restrictions`
- `hotel_settings` (configuração auto_apply)

Ao detectar INSERT/UPDATE/DELETE, invalida automaticamente:

- `rate_calendar`
- `dynamic_pricing_rules`
- `rate_restrictions`
- `hotel_settings_rate_system`

**Ativação**: A migration `20250214000002_enable_realtime_rate_system.sql` adiciona essas tabelas à publicação `supabase_realtime`.

---

## 3. Invalidação em Cascata

Ao criar/atualizar/deletar **Regras Dinâmicas** ou **Restrições**, são invalidadas:

- `rate_calendar`
- `dynamic_pricing_rules` / `rate_restrictions`
- `hotel_settings_rate_system`

Assim, Dashboard, Mapa de Tarifas e Grade ARI recarregam os dados automaticamente.

---

## 4. Exibição em 3 Camadas (Evitar Sobreposição)

### Componente `RatePriceBreakdown`

Mostra de forma transparente:

1. **Tarifa Base** — valor do `rate_calendar` ou categoria
2. **Regra Dinâmica** — ajuste aplicado (quando aplicável)
3. **Tarifa Final** — preço calculado exibido ao usuário

- Badge **"Dinâmico"** quando o preço foi alterado por regra
- Tooltip explicativo ao passar o mouse
- Integrado à Grade de Tarifas (RateCalendarGrid)

---

## 5. Hierarquia de Cálculo (Motor de Precificação)

A função PostgreSQL `calculate_rate_price` aplica, nesta ordem:

1. Tarifa Base (rate_calendar / room_categories)
2. Ajuste por Plano
3. Liga de ocupação (x1/x2/x3/x4)
4. Regras Dinâmicas (prioridade)
5. Restrições

---

## 6. Migrations Necessárias

| Migration | Descrição |
|-----------|-----------|
| `20250214000001_calculate_rate_price_by_occupancy.sql` | Liga x1/x2/x3/x4 por ocupação |
| `20250214000002_enable_realtime_rate_system.sql` | Realtime para rate_calendar, dynamic_pricing_rules, rate_restrictions |

---

## 7. Classificação de Origem de Alteração (update_source)

Para evitar alertas indevidos, toda atualização de tarifa usa `update_source`:

| Origem        | Toast              | Quando                            |
|---------------|--------------------|-----------------------------------|
| `manual`      | "Tarifário atualizado" | Edição manual pelo usuário       |
| `dynamic_rule`| Silencioso         | Recalculo por regra dinâmica      |
| `channel_sync`| Silencioso         | Sincronização OTA                 |
| `api_import`  | Silencioso         | Importação via API                |

**Modo Preview Dinâmico**: regras dinâmicas recalculam em cache apenas — não persistem no banco a cada acesso. Persistência apenas em edição manual.

---

## 8. Endpoints REST Otimizados

- [x] `GET /functions/v1/rates-dashboard?establishment_id=xxx` — Agrega categories, ratePlans, planTypes, hotelSettings
- [x] `GET /functions/v1/rates-map?establishment_id=xxx&start_date=...&end_date=...` — rate_calendar com filtros opcionais

Frontend usa `src/lib/ratesApi.ts` com fallback para queries Supabase diretas quando o endpoint não está disponível.

---

## 9. Próximos Passos (Roadmap)

- [x] Simulador antes de ativar regra dinâmica — `RuleSimulationPreview` no `DynamicRuleDialog`
- [x] Analytics de impacto de regras — `RuleImpactSummary` em `DynamicRulesView`
- [x] Worker de recálculo em background — Edge Function `recalc-rates` (Cron)
- [x] Cache Redis — Documentado em `RATE_SYSTEM_REDIS_CACHE.md` (requer Upstash)
