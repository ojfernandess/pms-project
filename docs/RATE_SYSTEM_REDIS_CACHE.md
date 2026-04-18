# Cache Redis para Preços Calculados (Produção)

Este documento descreve como integrar cache Redis para reduzir chamadas à RPC `calculate_rate_price` em produção.

> **Documentação completa:** Todas as informações de Edge Functions, Upstash e alternativas estão na página <strong>/documentation</strong> do sistema (aba Funcionalidades → Edge Functions e Upstash Redis).

## Visão Geral

- **Problema**: Cada visualização do Mapa/Grade ARI pode disparar centenas de chamadas RPC.
- **Solução**: Cache server-side (Redis) com TTL e invalidação por evento.

## Arquitetura Proposta

```
[Frontend] → [Edge Function rates-map] → [Redis: key = est:plan:cat:date]
                                            ↓ miss
                                       [PostgreSQL: calculate_rate_price]
                                            ↓
                                       [Redis SET + TTL]
```

## Implementação com Upstash

1. **Criar conta**: [Upstash](https://upstash.com) (free tier disponível).
2. **Criar banco Redis** e obter `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
3. **Configurar secrets** no Supabase:
   ```bash
   supabase secrets set UPSTASH_REDIS_REST_URL=xxx
   supabase secrets set UPSTASH_REDIS_REST_TOKEN=xxx
   ```
   Ou use um arquivo `.env`: `supabase secrets set --env-file supabase/functions/.env`
4. **rates-map com Redis** (implementado): quando `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` estão configurados, o `rates-map` enriquece preços calculados usando cache Redis.
5. **Invalidação**: Ao INSERT/UPDATE em `rate_calendar`, `dynamic_pricing_rules` ou `rate_restrictions`:
   - Database Webhook ou Edge Function invocada por trigger.
   - Deletar keys afetadas do Redis (por establishment, período, etc.).

## TTL Sugerido

- **5–15 minutos** para preços dinâmicos (ocupação muda ao longo do dia).
- Ajustar conforme criticidade de dados em tempo real.

## Exemplo de Código (Upstash Redis)

```typescript
import { Redis } from "https://deno.land/x/upstash_redis@v1.22.0/mod.ts";

const redis = new Redis({
  url: Deno.env.get("UPSTASH_REDIS_REST_URL")!,
  token: Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!,
});

const key = `rate:${estId}:${planId}:${catId}:${dateStr}`;
let price = await redis.get<number>(key);
if (price === null) {
  price = await supabase.rpc("calculate_rate_price", { ... });
  if (price > 0) await redis.setex(key, 900, price); // 15 min
}
```

## Worker de Recálculo

O worker `recalc-rates` pode ser estendido para popular o Redis em vez de (ou além de) persistir no banco, quando `persist_dynamic_rates` estiver desativado.
