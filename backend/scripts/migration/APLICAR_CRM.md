# Aplicar migrações CRM — Postgres

O CRM **não** usa Supabase CLI / `supabase db push`.  
DDL oficial: `backend/prisma/migrations/20261120*crm*` (cópia operacional em `backend/scripts/migration/crm/`).

## Automático (recomendado)

No **restart do backend**, `docker-entrypoint.sh` executa `apply-crm.sh` contra `DATABASE_URL` do Postgres (Easypanel/Dokploy).

Requer imagem rebuildada com este script + pasta `crm/`.

## Manual

```bash
# URL do Postgres PMS (não pooler supabase.com)
export DATABASE_URL='postgresql://USER:PASS@HOST:5432/DB'

cd backend
# no container:
./scripts/migration/apply-crm.sh "$(node ./scripts/print-database-url-libpq.mjs)"
```

Ou ficheiro a ficheiro:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/crm/20261120140000_crm_foundation.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/crm/20261120150000_crm_pipelines_deals.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/crm/20261120160000_crm_campaigns_segments.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/crm/20261120170000_crm_automations.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/crm/20261120180000_crm_advanced.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/crm/20261120181000_crm_role_permissions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migration/crm/20261120182000_crm_rpcs.sql
```

## Diagnóstico “nada aparece no CRM”

1. `crm_enqueue_outbox` precisa existir no Postgres e estar no allowlist Nest (`DataService` RPCs).
2. Motor/staff chamam outbox; a RPC (ou `POST /crm/outbox`) deve criar `crm_contacts` na hora.
3. Sem isso, reservas nunca viram contato — o menu CRM fica vazio.

## Verificação

```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND tablename LIKE 'crm_%'
ORDER BY 1;
```

Deve listar pelo menos `crm_contacts`, `crm_deals`, `crm_campaigns`, `crm_automations`, `crm_companies`, `crm_loyalty_*`.

## Nota

Cópias em `supabase/migrations/20261120*crm*` são **espelho legado** — não aplicar lá em produção.
