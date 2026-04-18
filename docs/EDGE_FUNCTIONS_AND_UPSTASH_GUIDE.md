# Guia Completo: Edge Functions e Upstash Redis

Documentação técnica com tutoriais para todas as Edge Functions do PMS, integração Upstash Redis e alternativas para AWS, Vercel e outras plataformas.

---

## Índice

1. [Visão Geral das Edge Functions](#1-visão-geral-das-edge-functions)
2. [Tutorial: Upstash Redis](#2-tutorial-upstash-redis)
3. [Tutorial por Edge Function](#3-tutorial-por-edge-function)
4. [Alternativas: AWS, Vercel, Netlify e outras](#4-alternativas-aws-vercel-netlify-e-outras)

---

## 1. Visão Geral das Edge Functions

| Função | Endpoint | Método | Autenticação | Descrição |
|--------|----------|--------|--------------|-----------|
| **rates-dashboard** | `/functions/v1/rates-dashboard` | GET | Bearer JWT | Agrega categorias, planos, tipos e configurações do tarifário |
| **rates-map** | `/functions/v1/rates-map` | GET | Bearer JWT | Retorna rate_calendar com enriquecimento Redis (Upstash) |
| **recalc-rates** | `/functions/v1/recalc-rates` | GET/POST | Bearer/Service Key | Worker de recálculo de preços dinâmicos (Cron) |
| **process-no-shows** | `/functions/v1/process-no-shows` | POST | - | Processa no-shows automaticamente (Cron diário) |
| **stripe-payment** | `/functions/v1/stripe-payment` | POST | Opcional | Cria Payment Intent do Stripe |
| **stripe-payment-status** | `/functions/v1/stripe-payment-status` | POST | - | Verifica status do pagamento Stripe |
| **stripe-refund** | `/functions/v1/stripe-refund` | POST | Bearer | Processa reembolso Stripe |
| **stripe-webhook** | `/functions/v1/stripe-webhook` | POST | Stripe-Signature | Webhook do Stripe (pagamentos, reembolsos) |
| **send-email-resend** | `/functions/v1/send-email-resend` | POST | Bearer | Envia e-mail via Resend API |
| **send-email-smtp** | `/functions/v1/send-email-smtp` | POST | Bearer | Envia e-mail via SMTP |
| **send-email-sendgrid** | `/functions/v1/send-email-sendgrid` | POST | Bearer | Envia e-mail via SendGrid |
| **send-checkout-reminders** | `/functions/v1/send-checkout-reminders` | GET/POST | - | Lembretes de check-out (Cron) |
| **get-reservation** | `/functions/v1/get-reservation` | GET/POST | Bearer/Guest | Busca reserva por identificador/localizador |
| **get-site-settings** | `/functions/v1/get-site-settings` | GET | - | Configurações públicas do site (sem auth) |
| **render-html** | `/functions/v1/render-html` | GET | - | Renderiza HTML de templates para SEO |
| **health-check** | `/functions/v1/health-check` | GET | - | Monitoramento de saúde (DB, Storage) |

---

## 2. Tutorial: Upstash Redis

### O que é Upstash?

Upstash é um Redis serverless com API REST. Ideal para Edge Functions (Deno/Node) pois não precisa de conexão persistente.

### Por que o PMS usa Upstash?

- **rates-map**: Cache de preços calculados (`calculate_rate_price`) para evitar centenas de chamadas RPC no frontend
- **TTL**: 15 minutos — preços dinâmicos mudam com ocupação
- **Fallback**: Sem Redis configurado, rates-map retorna rate_calendar sem enriquecimento

### Tutorial Passo a Passo

#### Passo 1: Criar conta Upstash

1. Acesse [https://upstash.com](https://upstash.com)
2. Crie uma conta (free tier disponível)
3. No Console, clique em **Create Database**
4. Escolha **Global** ou **Regional** (recomendado: região mais próxima do Supabase)
5. Anote:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

#### Passo 2: Configurar no Supabase

```bash
# Via CLI
supabase secrets set UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
supabase secrets set UPSTASH_REDIS_REST_TOKEN=AXxxxxxxx
```

Ou no Dashboard: **Project Settings > Edge Functions > Secrets**

#### Passo 3: Verificar

A Edge Function `rates-map` usa automaticamente o Redis quando as variáveis estão configuradas. Nenhuma alteração de código é necessária.

**Teste:**
```bash
curl -H "Authorization: Bearer SEU_JWT" \
  "https://SEU_PROJECT.supabase.co/functions/v1/rates-map?establishment_id=UUID&start_date=2025-02-15&end_date=2025-02-20"
```

Se a resposta incluir `_enriched: true`, o Redis está ativo e enriquecendo preços.

#### Passo 4: Invalidação (opcional)

Para invalidar o cache quando `rate_calendar`, `dynamic_pricing_rules` ou `rate_restrictions` forem alterados:

```typescript
// Exemplo: deletar keys por establishment e período
const pattern = `rate:${estId}:*`;
const keys = await redis.keys(pattern);
if (keys.length > 0) await redis.del(...keys);
```

---

## 3. Tutorial por Edge Function

### 3.1 rates-dashboard

**Objetivo:** Reduzir múltiplas queries do frontend em uma única chamada.

**Tutorial:**
```bash
# Chamada
curl -H "Authorization: Bearer JWT" \
  "https://PROJECT.supabase.co/functions/v1/rates-dashboard?establishment_id=UUID"

# Resposta
{
  "categories": [...],
  "ratePlans": [...],
  "planTypes": [...],
  "hotelSettings": { "rate_system_settings": {...} }
}
```

**Deploy:**
```bash
supabase functions deploy rates-dashboard
```

---

### 3.2 rates-map (com Upstash)

**Objetivo:** rate_calendar com preços calculados por regras dinâmicas. Com Redis: cache de até 300 entradas, TTL 15 min.

**Tutorial:**
```bash
# Sem Redis: retorna rate_calendar básico
# Com Redis + auto_apply_dynamic_rules: enriquece com original_base_price e base_price

curl -H "Authorization: Bearer JWT" \
  "https://PROJECT.supabase.co/functions/v1/rates-map?establishment_id=UUID&start_date=2025-02-15&end_date=2025-02-28"
```

**Secrets necessários:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (opcional)

---

### 3.3 recalc-rates

**Objetivo:** Worker Cron que persiste preços dinâmicos no `rate_calendar` quando `persist_dynamic_rates` está ativo.

**Tutorial:**
```bash
# Manual (Bearer ou Service Key)
curl -H "Authorization: Bearer JWT" \
  "https://PROJECT.supabase.co/functions/v1/recalc-rates?establishment_id=UUID&days_ahead=14"

# Cron (Supabase pg_cron ou cron-job.org)
# GET https://PROJECT.supabase.co/functions/v1/recalc-rates
# Header: Authorization: Bearer SERVICE_ROLE_KEY
```

**Configuração Cron (Supabase Dashboard):**
- Database > Extensions > pg_cron
- Ou use [cron-job.org](https://cron-job.org) para chamar a URL diariamente

---

### 3.4 process-no-shows

**Objetivo:** Marca reservas confirmadas como no-show quando o hóspede não compareceu após o horário de check-in.

**Tutorial:**
```bash
# POST (body opcional)
curl -X POST "https://PROJECT.supabase.co/functions/v1/process-no-shows" \
  -H "Content-Type: application/json" \
  -d '{"establishment_id": "UUID"}'

# Resposta
{ "success": true, "processed": 2, "method": "rpc" }
```

**Cron:** Configurar para executar diariamente às 19:00 (após horário de check-in).

---

### 3.5 stripe-payment, stripe-webhook, stripe-refund

**Objetivo:** Pagamentos online, webhooks e reembolsos.

**Secrets:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**Tutorial Stripe Webhook:**
1. Stripe Dashboard > Developers > Webhooks > Add endpoint
2. URL: `https://PROJECT.supabase.co/functions/v1/stripe-webhook`
3. Eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
4. Copie o Signing secret e configure em Supabase Secrets

---

### 3.6 send-email-resend, send-email-smtp

**Objetivo:** Envio de e-mails transacionais.

**Resend:** Requer `api_key` no body ou em variável de ambiente.  
**SMTP:** Credenciais no body (desenvolvimento) ou em secrets (produção).

---

### 3.7 send-checkout-reminders

**Objetivo:** Envia e-mails de lembrete X dias antes do check-out.

**Tutorial:**
```bash
# GET (cron-job.org)
curl "https://PROJECT.supabase.co/functions/v1/send-checkout-reminders?days=1&establishment_id=UUID"
```

---

### 3.8 get-reservation

**Objetivo:** API para buscar reserva por `identifier`, `locator` ou `reservation_code`. Suporta auth de usuário ou guest_account_id.

---

### 3.9 get-site-settings

**Objetivo:** Configurações públicas do site (sem auth). Cache 5 min.

---

### 3.10 health-check

**Objetivo:** Monitoramento. Verifica DB e Storage. Retorna 200 (healthy/degraded) ou 503 (unhealthy).

---

## 4. Alternativas: AWS, Vercel, Netlify e outras

Se você **não** usar Supabase, as Edge Functions precisam ser migradas. Abaixo: alternativas por categoria.

### 4.1 Alternativa: AWS Lambda + API Gateway

| Supabase Edge Function | AWS Equivalente | Observações |
|------------------------|-----------------|-------------|
| Todas as funções | AWS Lambda (Node.js 18+) | Converter Deno para Node ou usar Deno no Lambda |
| Secrets | AWS Secrets Manager ou SSM Parameter Store | |
| Cron (recalc-rates, process-no-shows, send-checkout-reminders) | EventBridge (CloudWatch Events) | Regras de agendamento |
| Webhook Stripe | API Gateway HTTP API + Lambda | |

**Exemplo: Migrar rates-map para AWS Lambda**

```javascript
// lambda/rates-map/index.mjs (Node.js ESM)
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

export const handler = async (event) => {
  const authHeader = event.headers?.Authorization;
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Autorização obrigatória' }) };

  const establishmentId = event.queryStringParameters?.establishment_id;
  if (!establishmentId) return { statusCode: 400, body: JSON.stringify({ error: 'establishment_id é obrigatório' }) };

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

  // ... lógica idêntica ao rates-map ...
  // Retornar: { statusCode: 200, body: JSON.stringify({ rateCalendar, _enriched }) }
};
```

**Configurar Upstash no AWS:**
- Secrets Manager: chaves `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`
- Ou variáveis de ambiente no Lambda

---

### 4.2 Alternativa: Vercel Serverless Functions

| Supabase Edge Function | Vercel Equivalente |
|------------------------|---------------------|
| Todas | API Routes em `/api/` (Next.js) ou Vercel Serverless Functions |
| Cron | Vercel Cron Jobs (plano Pro) ou external cron (cron-job.org) |

**Exemplo: `/api/rates-map/route.ts` (Next.js App Router)**

```typescript
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return Response.json({ error: 'Autorização obrigatória' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const establishmentId = searchParams.get('establishment_id');
  if (!establishmentId) return Response.json({ error: 'establishment_id é obrigatório' }, { status: 400 });

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

  // ... lógica ...
  return Response.json({ rateCalendar: entries, _enriched });
}
```

**vercel.json para Cron:**
```json
{
  "crons": [
    { "path": "/api/recalc-rates", "schedule": "0 2 * * *" },
    { "path": "/api/process-no-shows", "schedule": "0 22 * * *" }
  ]
}
```

---

### 4.3 Alternativa: Netlify Functions

| Supabase Edge Function | Netlify Equivalente |
|------------------------|----------------------|
| Todas | Netlify Functions em `/netlify/functions/` |
| Cron | Netlify Scheduled Functions (Beta) ou cron-job.org |

**Exemplo: `netlify/functions/rates-map.ts`**

```typescript
import type { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

export const handler: Handler = async (event) => {
  const authHeader = event.headers['authorization'];
  if (!authHeader) return { statusCode: 401, body: JSON.stringify({ error: 'Autorização obrigatória' }) };

  const establishmentId = event.queryStringParameters?.establishment_id;
  if (!establishmentId) return { statusCode: 400, body: JSON.stringify({ error: 'establishment_id é obrigatório' }) };

  // ... idêntico ...
  return { statusCode: 200, body: JSON.stringify({ rateCalendar, _enriched }) };
};
```

---

### 4.4 Alternativa ao Redis (Upstash): ElastiCache, Redis Cloud, Memcached

| Serviço | Quando usar | Observação |
|---------|-------------|------------|
| **Upstash** | Edge/Serverless (REST API) | Recomendado para Lambda, Vercel, Netlify |
| **AWS ElastiCache** | EC2/ECS/Lambda em VPC | Requer conexão TCP; Lambda precisa estar em VPC |
| **Redis Cloud** | Qualquer ambiente | Oferece REST API em planos específicos |
| **AWS DynamoDB** | Sem Redis | Usar como cache key-value; TTL nativo |

**Exemplo: Cache com DynamoDB (alternativa ao Redis)**

```javascript
// AWS Lambda com DynamoDB como cache
const key = `rate:${estId}:${planId}:${catId}:${dateStr}`;
const { Item } = await dynamodb.get({
  TableName: 'rate-cache',
  Key: { pk: key },
}).promise();

if (Item && Item.ttl > Math.floor(Date.now()/1000)) {
  return Item.price;
}
// ... calcular, depois:
await dynamodb.put({
  TableName: 'rate-cache',
  Item: { pk: key, price, ttl: Math.floor(Date.now()/1000) + 900 },
}).promise();
```

---

### 4.5 Alternativa ao Supabase (Banco e Auth)

| Componente Supabase | Alternativa AWS | Alternativa Outras |
|---------------------|-----------------|--------------------|
| PostgreSQL | RDS PostgreSQL, Aurora | Neon, PlanetScale (MySQL) |
| Auth | Cognito, Auth0 | Clerk, NextAuth |
| Storage | S3 | Cloudflare R2 |
| Realtime | AppSync, Ably | Pusher, Socket.io |

**Importante:** As Edge Functions dependem de `createClient` do Supabase. Para AWS:
- Se mantiver Supabase apenas como banco: continue usando `@supabase/supabase-js` apontando para a URL do projeto
- Se migrar completamente: substitua chamadas por cliente PostgreSQL (ex: `pg`) ou ORM (Prisma, Drizzle)

---

## 5. Resumo de Secrets e Variáveis

| Variável | Onde usar | Obrigatória |
|----------|-----------|-------------|
| `SUPABASE_URL` | Todas | Sim |
| `SUPABASE_SERVICE_ROLE_KEY` | Todas (backend) | Sim |
| `UPSTASH_REDIS_REST_URL` | rates-map | Não (opcional para cache) |
| `UPSTASH_REDIS_REST_TOKEN` | rates-map | Não |
| `STRIPE_SECRET_KEY` | stripe-payment, stripe-refund | Sim (se usar Stripe) |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | Sim |
| `RESEND_API_KEY` | send-email-resend | Sim (se usar Resend) |

---

## 6. Checklist de Deploy

- [ ] Configurar todos os secrets no Supabase (ou plataforma alternativa)
- [ ] Deploy das Edge Functions: `supabase functions deploy`
- [ ] Configurar Cron para recalc-rates, process-no-shows, send-checkout-reminders
- [ ] Configurar webhook do Stripe apontando para stripe-webhook
- [ ] (Opcional) Upstash: criar conta e configurar UPSTASH_REDIS_* para rates-map
- [ ] Testar health-check para monitoramento
