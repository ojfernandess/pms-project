# Edge Function: apply-dynamic-pricing-rules

Edge Function do Supabase para aplicar regras de precificação dinâmica e calcular preços finais com base em condições específicas.

## 🎯 Objetivo

Esta função aplica regras dinâmicas de precificação de forma centralizada e confiável, garantindo que:
- As condições dos triggers sejam verificadas corretamente
- Os ajustes sejam aplicados na ordem de prioridade
- O preço final seja calculado considerando todas as regras ativas

## 📋 Pré-requisitos

- Supabase CLI instalado (opcional, para deploy via CLI)
- Projeto Supabase configurado
- Tabelas do sistema tarifário criadas:
  - `dynamic_pricing_rules`
  - `rate_calendar`
  - `room_categories`
  - `hotel_settings`
  - `local_events` (opcional)

## 🚀 Como Deployar

### Opção 1: Via Supabase Dashboard (Recomendado) ⭐

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Edge Functions** no menu lateral
4. Clique em **Create a new function**
5. Nome: `apply-dynamic-pricing-rules` (exatamente assim, com hífens)
6. Copie e cole o conteúdo do arquivo `index.ts`
7. Clique em **Deploy**

### Opção 2: Via Supabase CLI

```bash
# 1. Instalar Supabase CLI (se não tiver)
npm install -g supabase

# 2. Fazer login
supabase login

# 3. Linkar ao projeto
supabase link --project-ref seu-project-ref

# 4. Deploy da função
supabase functions deploy apply-dynamic-pricing-rules
```

## 📝 Uso

### Request Body

```json
{
  "establishment_id": "uuid-do-estabelecimento",
  "category_id": "uuid-da-categoria",
  "pricing_plan_id": "uuid-do-plano-tarifario",
  "date": "2024-12-07",
  "adults": 2,
  "children": 0
}
```

### Response

```json
{
  "final_price": 250.50,
  "base_price": 200.00,
  "adjustments_applied": [
    {
      "rule_id": "uuid-da-regra",
      "rule_name": "Aumento em Alta Ocupação",
      "adjustment_type": "percentage",
      "adjustment_value": 15,
      "final_adjustment": 30.00
    }
  ],
  "auto_apply_enabled": true,
  "metrics": {
    "occupancy": 85.5,
    "pickup_rate": 3.2,
    "has_local_event": true,
    "event_impact": 10
  }
}
```

## 🔧 Funcionalidades

### 1. Verificação de Configuração
- Verifica se `auto_apply_dynamic_rules` está habilitado em `hotel_settings`
- Se não estiver habilitado, retorna apenas o preço base calculado pela função PostgreSQL

### 2. Cálculo de Preço Base
- Busca preço no `rate_calendar` para a data específica
- Se não encontrar, usa preço base da categoria
- Adiciona valores de adultos e crianças extras

### 3. Aplicação de Regras Dinâmicas
A função verifica e aplica regras baseadas em:

#### Ocupação (`occupancy`)
- Verifica `min_occupancy` e `max_occupancy` do `trigger_condition`
- Aplica se a ocupação atual estiver no range especificado

#### Pickup Rate (`booking_velocity`)
- Verifica `min_bookings` do `trigger_condition`
- Aplica se o pickup rate for >= mínimo especificado

#### Dia da Semana (`day_of_week`)
- Verifica se o dia atual está na lista `days` do `trigger_condition`
- Aplica apenas nos dias especificados

#### Antecedência (`advance_booking`)
- Verifica `min_days` e `max_days` do `trigger_condition`
- Aplica se os dias até a data estiverem no range especificado

#### Eventos Locais (`local_event`)
- Verifica se há eventos locais ativos na data
- Aplica impacto do evento automaticamente

#### Demanda (`custom`)
- Verifica `min_score` e `max_score` do `trigger_condition`
- Aplica se o score de demanda estiver no range especificado

### 4. Ordenação por Prioridade
- Regras são aplicadas em ordem crescente de `priority`
- Regras com menor número de prioridade são aplicadas primeiro

### 5. Tipos de Ajuste
- **percentage**: Ajuste percentual (ex: +15%)
- **fixed**: Ajuste fixo em valor (ex: +R$ 50)
- **multiplier**: Multiplicador (ex: 1.2x)

## 🔒 Segurança

A função:
- Verifica campos obrigatórios
- Valida dados de entrada
- Trata erros graciosamente
- Retorna mensagens de erro claras

## ⚠️ Limitações

- A função calcula `demand_score` como valor fixo (50) - pode ser melhorado futuramente
- Eventos locais são buscados apenas se a tabela existir
- Não valida se as regras estão conflitantes entre si

## 🔄 Integração com Frontend

```typescript
const response = await fetch(
  `${supabaseUrl}/functions/v1/apply-dynamic-pricing-rules`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      establishment_id: '...',
      category_id: '...',
      pricing_plan_id: '...',
      date: '2024-12-07',
      adults: 2,
      children: 0,
    }),
  }
);

const data = await response.json();
console.log('Preço final:', data.final_price);
```

## 📊 Logs

A função registra erros no console do Supabase. Para visualizar:
1. Vá em **Edge Functions** no Dashboard
2. Clique na função `apply-dynamic-pricing-rules`
3. Vá em **Logs** para ver erros e debug

