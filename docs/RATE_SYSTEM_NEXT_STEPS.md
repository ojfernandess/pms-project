# Próximos Passos — Sistema Tarifário (Roadmap Detalhado)

Análise do documento `RATE_SYSTEM_ARCHITECTURE.md` e plano de implementação para os itens do roadmap.

---

## Estado Atual

| Componente | Implementação | Tecnologia |
|------------|----------------|------------|
| Dashboard de preços | ✅ Completo | React Query + Supabase REST direto |
| Mapa de Tarifas (RateCalendarGrid) | ✅ Completo | Supabase `rate_calendar` + RPC `calculate_rate_price` |
| Grade ARI | ✅ Completo | Supabase + DynamicRatePricesContext |
| Regras dinâmicas | ✅ Completo | Supabase `dynamic_pricing_rules` |
| Realtime | ✅ Completo | `useRateSystemRealtime` (Supabase Realtime) |
| Analytics | ✅ Parcial | `RateAnalyticsView`, `useRateMetrics` (ADR, RevPAR, ocupação) |

**Dados hoje**: múltiplas queries Supabase (room_categories, pricing_plans, rate_calendar, dynamic_pricing_rules, rate_restrictions, hotel_settings) feitas separadamente pelos hooks e componentes.

---

## 1. Endpoints REST Otimizados

**Objetivo**: `GET /rates/dashboard` e `GET /rates/map` agregando dados em uma única chamada.

### Problema atual
- **PriceDashboardView**: 5+ queries (categories, ratePlans, planTypes, hotelSettings, rateCalendar)
- **RateCalendarGrid**: rateCalendar via `useRateSystem`, categories, planTypes, etc.
- Latência por N+1 requests e waterfall de carregamento

### Implementação sugerida

#### Opção A: Edge Function (recomendado)
Criar `supabase/functions/rates-dashboard/index.ts` e `supabase/functions/rates-map/index.ts`:

```
GET /functions/v1/rates-dashboard?establishment_id=xxx
→ Retorna: categories, ratePlans, planTypes, hotelSettings, summary (últimos 30 dias)
```

```
GET /functions/v1/rates-map?establishment_id=xxx&plan_id=yyy&category_id=zzz&start_date=...&end_date=...
→ Retorna: rate_calendar filtrado + occupancy_projections + dynamic_rules aplicáveis
```

**Benefícios**: Reduz round-trips, permite lógica server-side (joins, agregações).

#### Opção B: RPC no PostgreSQL
Função `get_rates_dashboard(p_establishment_id uuid)` que retorna JSON agregado via `Supabase.rpc()`.

### Ordem de execução
1. Criar migration ou Edge Function para `rates-dashboard`
2. Atualizar `PriceDashboardView` para usar o novo endpoint (com fallback para queries atuais)
3. Criar endpoint `rates-map`
4. Atualizar `RateCalendarGrid` e `useRateSystem` para consumir

**Estimativa**: 4–6h

---

## 2. Cache Redis para Preços Calculados (Produção)

**Objetivo**: Evitar recálculo de `calculate_rate_price` para cada requisição; cache server-side.

### Problema atual
- Cada célula do grid chama RPC `calculate_rate_price` (ou usa cache em memória no frontend)
- Em produção, muitas visualizações = muitas chamadas RPC
- Função pesada (liga ocupação, regras dinâmicas, restrições)

### Arquitetura proposta

```
[Frontend] → [Edge Function / API] → [Redis: key = est_id:plan:cat:date]
                                         ↓ miss
                                    [PostgreSQL: calculate_rate_price]
                                         ↓
                                    [Redis SET + TTL]
```

### Implementação
- **Supabase**: Redis não nativo; usar **Upstash Redis** (integração via Edge Functions)
- TTL sugerido: 5–15 min para preços dinâmicos (ocupação muda)
- Invalidação: ao `INSERT/UPDATE` em `rate_calendar`, `dynamic_pricing_rules`, `rate_restrictions` → limpar keys afetadas
- Database webhook ou trigger pode publicar evento para worker invalidar cache

### Dependências
- Conta Upstash (free tier disponível)
- Edge Function com `@upstash/redis`
- Política de invalidação definida

**Estimativa**: 8–12h (incl. setup Upstash e invalidação)

---

## 3. Worker de Recálculo em Background

**Objetivo**: Recalcular preços dinâmicos periodicamente sem bloquear o usuário.

### Problema atual
- Recálculo ocorre no frontend ao abrir o Mapa/Grade (lotes de 3, delay 150ms)
- Em 90 dias × 4 categorias × 3 planos ≈ 1080 chamadas
- Usuário espera ou vê “loading” prolongado

### Arquitetura proposta

```
[Cron / pg_cron] → [Edge Function: recalc-rates] → calculate_rate_price (batch)
                         ↓
                   [Atualiza rate_calendar com update_source=dynamic_rule] (opcional)
                         ou
                   [Popula cache Redis] (modo preview atual)
```

### Modos
1. **Preview (atual)**: Worker popula Redis/cache; frontend lê do cache
2. **Persistente**: Worker grava em `rate_calendar` com `update_source=dynamic_rule`; frontend lê direto do banco

### Implementação
- Supabase Edge Function `recalc-rates` invocada por Cron (ex: a cada 15–30 min)
- Ou `pg_cron` no Supabase (se disponível) chamando função PL/pgSQL que dispara HTTP para Edge Function
- Processar em lotes para não estourar timeout (Edge Function 60s padrão)

**Estimativa**: 6–10h

---

## 4. Analytics de Impacto de Regras (ADR, Ocupação)

**Objetivo**: Mostrar o impacto das regras dinâmicas em ADR e ocupação.

### Estado atual
- `useRateMetrics`: ADR, RevPAR, ocupação, pickup rate
- `RateAnalyticsView`: gráficos, recomendações (com feature flag)
- Não há comparação explícita “com vs sem regra dinâmica”

### Funcionalidades a adicionar
1. **Painel por regra**: Para cada `dynamic_pricing_rule` ativa, mostrar:
   - Datas/categorias/planos afetados
   - ADR médio com regra vs sem regra (simulação)
   - Ocupação no período
   - Receita incremental estimada
2. **A/B simulado**: “Se desativar esta regra, qual seria o ADR?”
3. **Histórico**: ADR antes/depois da ativação da regra

### Implementação
- Nova RPC `get_rule_impact(rule_id, start_date, end_date)`:
  - Calcula preços com e sem a regra
  - Retorna ADR, RevPAR, occupancy por categoria/plano
- Componente `RuleImpactCard` em `DynamicRulesView` ou nova aba “Impacto” em `RateAnalyticsView`
- Gráfico comparativo (com/sem regra) em `RateAnalyticsView`

**Estimativa**: 6–8h

---

## 5. Simulador Antes de Ativar Regra Dinâmica

**Objetivo**: Usuário vê a prévia do impacto antes de ativar a regra.

### Estado atual
- `DynamicRuleDialog`: formulário completo (trigger, adjustment, prioridade, etc.)
- Regra ativada imediatamente ao salvar
- Sem feedback visual de “quantas células mudariam” ou “quanto aumentaria o ADR”

### Funcionalidades
1. **Preview no dialog**: Ao preencher a regra (antes de salvar), mostrar:
   - Número de células que seriam alteradas
   - Exemplos de preços (3–5 datas) com “antes → depois”
   - ADR projetado com a regra
2. **Modo “Simular”**: Checkbox “Apenas simular” que não grava; abre modal com grid de preview
3. **Comparação lado a lado**: Antes/depois em um período selecionado

### Implementação
- Reutilizar `calculate_rate_price` no frontend (já existe via `useRateSystem`)
- No `DynamicRuleDialog`, ao alterar campos:
  - Debounce 500ms
  - Chamar `calculate_rate_price` para período visível (ex: 14 dias) com a regra “virtual”
  - Comparar com preços atuais (do cache/rate_calendar)
  - Exibir mini-preview (cards ou tabela) dentro do dialog
- Opção “Simular” → abre `RuleSimulationModal` com grid reduzido (7–14 dias)

**Estimativa**: 5–8h

---

## Priorização Sugerida

| # | Item | Impacto | Esforço | Dependências | Ordem |
|---|------|---------|---------|--------------|-------|
| 1 | Endpoints REST (`/rates/dashboard`, `/rates/map`) | Alto | 4–6h | Nenhuma | 1º |
| 2 | Simulador antes de ativar regra | Alto (UX) | 5–8h | Nenhuma | 2º |
| 3 | Analytics de impacto (ADR, ocupação) | Médio | 6–8h | Nenhuma | 3º |
| 4 | Worker de recálculo em background | Médio | 6–10h | Endpoints (opcional) | 4º |
| 5 | Cache Redis (produção) | Médio (escala) | 8–12h | Worker ou invalidação | 5º |

---

## Resumo de Ações Imediatas

1. **Curto prazo (1–2 sprints)**  
   - Implementar `GET /rates/dashboard` e `GET /rates/map`  
   - Adicionar simulador no `DynamicRuleDialog`

2. **Médio prazo**  
   - Analytics de impacto por regra  
   - Worker de recálculo em background  

3. **Longo prazo (produção)**  
   - Cache Redis com Upstash  
   - Invalidação automatizada via eventos do banco  
