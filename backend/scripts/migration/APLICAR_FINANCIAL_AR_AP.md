# Aplicar migração — Contas a Receber / Pagar (Postgres no deploy)

O PMS em produção usa **PostgreSQL** (`DATABASE_URL`), não o Supabase Dashboard nem `supabase db push`.

Os SQL ficam em `backend/scripts/migration/financial_ar_ap/` (cópia das `supabase/migrations/202511181*.sql` — manter sincronizados ao alterar o domínio financeiro).

## Automático (recomendado)

No **deploy/restart do backend**, `docker-entrypoint.sh` executa `apply-financial-ar-ap.sh` quando existir (como `parking_service.sql`).

Requisitos no container:

- `postgresql-client` (`psql`)
- `DATABASE_URL` (URL libpq via `print-database-url-libpq.mjs` no entrypoint)
- `auth-compat.sql` já aplicado (`auth.uid()` para RPCs)

Variável opcional:

- `FINANCIAL_AR_AP_MIGRATION_ON_START` — default `true` (aplica em cada restart do backend). Defina `false` para pular (ex.: depuração).

## Manual (produção / staging)

```bash
# Na raiz do repositório ou no host com psql
cd backend
export DATABASE_URL="postgresql://USER:PASS@HOST:5432/pms"

PSQL_URL="$(node ./scripts/print-database-url-libpq.mjs)"
chmod +x ./scripts/migration/apply-financial-ar-ap.sh
./scripts/migration/apply-financial-ar-ap.sh "$PSQL_URL"
```

No container:

```bash
cd /app
./scripts/migration/apply-financial-ar-ap.sh "$(node ./scripts/print-database-url-libpq.mjs)"
```

## Ordem das fases (1 → 6)

1. `20251118150000` — sync AR reserva  
2. `20251118160000` — quitações / RPCs  
3. `20251118170000` — fornecedores AP  
4. `20251118180000` — AR manual / devedor  
5. `20251118190000` — caixa ← quitações  
6. `20251118195000` — prévia/correção AR legado  

## Pós-deploy (aplicação)

1. Financeiro → **Fluxo de Caixa** → *Sincronizar quitações → caixa* (se já havia quitações).  
2. Painel **Migração AR** → *Gerar prévia* → conferir → *Aplicar correção* (por estabelecimento).  
3. Testes: `npx vitest run src/lib/financial/`

## Verificação rápida

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'register_receivable_settlement',
    'get_financial_cash_flow_report',
    'preview_financial_ar_migration'
  );
```

Deve listar as três funções.

**API (myapi):** cada RPC nova precisa constar no `RPCS` de `backend/src/data/data.service.ts`; sem isso o Nest responde **400** `Função não disponível`. Após alterar a lista, faça **redeploy do backend**.

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'financial_title_settlements'
);
```