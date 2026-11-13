# Validação contra a instância Supabase (Postgres)

Os inventários em `docs/migration/` reflectem **só** o que está em `supabase/migrations/`. O próximo passo natural é **confirmar o estado real** do projeto na cloud (staging ou produção) e registar diferenças.

## Pré-requisitos

- [Supabase CLI](https://supabase.com/docs/guides/cli) autenticado (`supabase login`) ou acesso à connection string do Postgres.
- Variáveis: `SUPABASE_DB_URL` (ou usar `supabase db` com o project link).

## 1. Schema-only dump (referência)

Gera um ficheiro com o DDL efectivo (inclui o que foi criado só no dashboard):

```bash
# Com project ligado na pasta do repo
supabase db dump --schema public --schema auth -f /tmp/pms_schema.sql
```

Ou com `pg_dump` directo:

```bash
pg_dump "$SUPABASE_DB_URL" --schema-only --schema=public --schema=auth -f /tmp/pms_schema.sql
```

**Uso:** diff entre `/tmp/pms_schema.sql` e uma aplicação sequencial das migrações locais (ou comparar contagens abaixo).

## 2. Contagens rápidas (SQL no SQL Editor ou `psql`)

Executar no Postgres da instância:

```sql
-- Funções em public (aprox. RPCs expostas)
SELECT count(*) AS public_functions
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f';

-- Políticas RLS activas
SELECT count(*) AS rls_policies
FROM pg_policies WHERE schemaname = 'public';

-- Tabelas public com RLS activado
SELECT count(*) AS rls_enabled_tables
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
WHERE t.schemaname = 'public' AND c.relrowsecurity = true;

-- Triggers em public (e auth se precisar)
SELECT tg.tgname AS trigger_name,
       n.nspname  AS table_schema,
       c.relname  AS table_name
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT tg.tgisinternal
  AND n.nspname IN ('public', 'auth')
ORDER BY 2, 3, 1;
```

### Extensões relevantes

```sql
SELECT extname FROM pg_extension
WHERE extname IN ('pg_cron', 'pg_net', 'uuid-ossp', 'pgcrypto')
ORDER BY 1;
```

### Jobs pg_cron (se a extensão existir)

```sql
SELECT jobid, jobname, schedule, command, active
FROM cron.job
ORDER BY jobname;
```

Comparar com [pg-cron-inventory.md](./pg-cron-inventory.md). Nota: URLs ou keys embutidas em migrações antigas podem estar desactualizadas.

Comparar ordens de grandeza com o resumo em:

- [sql-rpc-inventory.md](./sql-rpc-inventory.md) (funções)
- [rls-policies-inventory.md](./rls-policies-inventory.md) (políticas)
- [triggers-inventory.md](./triggers-inventory.md) (triggers)

**Nota:** contagens exactas raramente coincidem linha-a-linha com os inventários (funções internas vs RPC, triggers em `auth`, etc.); o objectivo é detectar **lacunas grandes** ou drift.

## 3. Objectos frequentemente drift

- Políticas recriadas via `DO $$` + `pg_policies` (ver limitações em [rls-policies-inventory.md](./rls-policies-inventory.md)).
- Funções só deployadas manualmente.
- Edge Functions e secrets (dashboard vs `supabase/config.toml`).
- Jobs **pg_cron** (muitas vezes configurados ou corrigidos só na cloud).

## 4. Registo de divergências

Use o template [drift-log.template.md](./drift-log.template.md): copie para `drift-log.md` (ou guarde fora do git se incluir dados sensíveis) e preencha uma linha por discrepância (função, policy, trigger, job cron, etc.).

---

Quando as contagens e o dump estiverem alinhados com o repo, o pacote de migração está **validado** para decisões de cutover ou de replicação noutro host.
