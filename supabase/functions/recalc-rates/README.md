# recalc-rates — Worker de Recálculo de Preços Dinâmicos

Edge Function que recalcula preços com regras dinâmicas em background.

## Uso

```
GET /functions/v1/recalc-rates?establishment_id=xxx&days_ahead=7
```

- **establishment_id** (opcional): UUID. Se omitido, processa todos os estabelecimentos ativos.
- **days_ahead** (opcional): Dias a partir de hoje (default: 7, máx: 30).

## Configuração

O worker **só persiste** preços quando `hotel_settings.rate_system_settings.persist_dynamic_rates === true`.

Para habilitar em um estabelecimento:

```sql
UPDATE hotel_settings
SET rate_system_settings = jsonb_set(
  COALESCE(rate_system_settings, '{}'),
  '{persist_dynamic_rates}',
  'true'
)
WHERE establishment_id = 'uuid-do-estabelecimento';
```

## Cron (Supabase)

Configure um Cron para executar diariamente:

1. Supabase Dashboard → Database → Extensions → habilitar `pg_cron` (se disponível)
2. Ou use um serviço externo (Vercel Cron, GitHub Actions, etc.) para chamar a função

Exemplo com `curl`:
```bash
curl -X GET "https://SEU_PROJETO.supabase.co/functions/v1/recalc-rates?days_ahead=7" \
  -H "Authorization: Bearer SEU_SERVICE_ROLE_KEY"
```

## Escopo

- Processa **todas** as categorias e **todos** os planos ativos do estabelecimento.
- Prioriza os planos usados na reserva: `public_pricing_plan_1_id` e `public_pricing_plan_2_id` de `hotel_settings`, garantindo que o Mapa de Tarifas / Grade ARI exiba os mesmos valores que o motor de reservas e a página pública.
