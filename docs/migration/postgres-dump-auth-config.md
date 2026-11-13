# Dump Supabase → Postgres (pacote core: auth, admin, estabelecimentos)

Copia **dados** (não o DDL completo) para um Postgres de destino que **já tenha o schema** do PMS. Inclui login, super admin, empresas, estabelecimentos e configurações principais — **não** reservas, quartos, tarifário completo, etc. (isso é outro dump).

## Tabelas incluídas

Lista em [`scripts/migration/core-data-tables.txt`](../../scripts/migration/core-data-tables.txt):

- `auth.users`, `auth.identities` — senhas `encrypted_password` intactas (Nest só compara bcrypt)
- `public.users`, `admin_users`, `user_companies`, `companies`, `establishments`
- `employee_roles`, `employees`
- `site_settings`, `hotel_settings`, `api_settings`

## Pré-requisitos

- `pg_dump`, `pg_restore`, `psql` no PATH (PostgreSQL client 15+)
- **Origem:** `SOURCE_DATABASE_URL` = URI session pooler Supabase **:5432** (nunca commitar)
- **Destino:** `TARGET_DATABASE_URL` = Postgres novo (Easypanel, Docker `local-db`, etc.)
- **Schema no destino:** todas as migrações em `supabase/migrations` já aplicadas (estrutura igual à cloud). Sem schema, o `pg_restore` falha.

### Preparar o destino (uma vez)

1. Criar base vazia e aplicar migrações (exemplo com Supabase CLI ligado ao destino, ou pipeline interno).
2. Roles para o Nest/RLS:

```bash
psql "$TARGET_DATABASE_URL" -f scripts/migration/bootstrap-target-postgres.sql
```

Isto cria `anon`, `authenticated`, `service_role` e extensões mínimas.

## Exportar do Supabase

PowerShell (Windows):

```powershell
$env:SOURCE_DATABASE_URL = "postgresql://..."   # session pooler :5432
Set-Location "d:\Projects Cursor\pms-project-main"
.\scripts\migration\dump-supabase-core.ps1
```

Linux:

```bash
export SOURCE_DATABASE_URL='postgresql://...'
./scripts/migration/dump-supabase-core.sh
```

Saída: `postgres-dumps/core-data.dump` (gitignored).

## Restaurar no Postgres destino

```powershell
$env:TARGET_DATABASE_URL = "postgresql://pms:...@postgres:5432/pms"
.\scripts\migration\restore-postgres-core.ps1
```

O script aplica bootstrap, `pg_restore --data-only --disable-triggers`, e corre `verify-core-data.sql`.

## Cutover da API

1. No Easypanel (ou `backend/.env`), troca `DATABASE_URL` de Supabase para `TARGET_DATABASE_URL`.
2. `JWT_SECRET` e Redis **mantém-se** — sessões Nest estão no Redis, não no Postgres.
3. Testa login com um super admin e abre configurações de um estabelecimento.
4. **Não** correr `prisma migrate deploy` contra Supabase só por causa deste dump; migrações `backend_*` são para Postgres próprio quando existirem.

## Se as tabelas no destino já tiverem linhas

Use uma base **vazia** ou trunca as mesmas tabelas na ordem inversa das FKs antes do restore. Um segundo restore em cima de dados duplicados gera conflitos de PK.

## Próximo passo (dados operacionais)

Quando o core estiver validado, repete o processo com mais tabelas (reservas, `rate_calendar`, `rooms`, …) ou um `pg_dump` completo dos schemas `public` + `auth`. Ver [cloud-validation.md](./cloud-validation.md).

## Avisos

- Não uses `pg_dump` na password em claro nos logs.
- O worker/API com `DATABASE_URL` antiga continua a apontar para Supabase até alterares o Environment.
- Ficheiros em Supabase Storage **não** entram neste dump — copiar para `STORAGE_DIR` do Nest à parte.
