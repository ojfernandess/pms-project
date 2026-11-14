# Cutover: Supabase → PostgreSQL Easypanel (procedimento)

**Não execute o passo 10 em produção sem aprovação.** Preparação não exige downtime.

## Pré-requisitos

- Projeto Easypanel com **5 serviços** (template `stayos-pms`, Postgres interno).
- `pg_dump`, `pg_restore`, `psql` na sua máquina ou jump host.
- `SOURCE_DATABASE_URL` = pooler Supabase **:5432** (session).
- Backup manual do projeto Supabase (snapshot/dashboard) antes de qualquer teste destrutivo no **destino** (nunca na origem).

## Parte A — Preparar Postgres destino (sem tocar produção)

1. Instale serviços via JSON do template (`useInternalPostgres: true`). Ver [../../deploy/easypanel-template/TESTING-STAGING.md](../../deploy/easypanel-template/TESTING-STAGING.md).
2. Anote senha Postgres gerada (Environment do serviço `pms-postgres` no painel após criar).
3. Montar `TARGET_DATABASE_URL` interna, por exemplo:

   `postgresql://postgres:SENHA@$(NOME_PROJETO)_pms-postgres:5432/$(NOME_PROJETO)`

   Para restore **de fora** do cluster, use túnel SSH ou `psql` num container one-off na rede Easypanel.

4. Aplicar **schema** no destino (escolha uma):

   - **A)** Pipeline que aplica todos os ficheiros em `supabase/migrations/` em ordem; ou  
   - **B)** `pg_dump --schema-only --no-owner` da origem e restore no destino.

5. Executar:

   ```bash
   psql "$TARGET_DATABASE_URL" -f scripts/migration/bootstrap-target-postgres.sql
   ```

6. `PRISMA_MIGRATE_ON_START=false` no backend até validar schema.

## Parte B — Migrar dados (core primeiro)

### Opção B1 — Só env no Easypanel (sem comandos manuais)

No serviço **pms-backend** (não no worker), na **primeira** migração para `pms-postgres`:

| Variável | Valor |
|----------|--------|
| `DATABASE_URL` | Postgres **interno** Easypanel (`postgresql://...@projetolab_pms-postgres:5432/...`) — **sem** apontar ao Supabase após o cutover |
| `SUPABASE_DATABASE_URL` | Origem Supabase, pooler **session :5432** (não 6543) |
| `APP_IMPORT_SUPABASE_DATA` | `once` (primeira vez) ou `force` (repetir e faz TRUNCATE nas tabelas do manifest) |
| `COPY_MODE` | `node` (padrão na imagem) ou `pg` (exige `postgresql-client` na imagem) |
| `PRISMA_MIGRATE_ON_START` | `true` se o destino estiver vazio **e** o schema vier só do Prisma; caso contrário aplique antes o DDL Supabase (Parte A §4) |

Reinicie o **backend**. Os logs devem mostrar `Import Supabase → destino`. O marcador fica em `/app/storage/.supabase-data-imported` (monte volume em `/app/storage`).

Depois do import OK: remova ou comente `SUPABASE_DATABASE_URL` e `APP_IMPORT_SUPABASE_DATA`; mantenha só `DATABASE_URL` no Postgres interno.

Tabelas copiadas: [../../backend/scripts/migration/core-data-tables.txt](../../backend/scripts/migration/core-data-tables.txt). Para o PMS completo, use ainda dump/restore manual (opção B2) ou amplie o manifest.

### Opção B2 — Dump/restore na sua máquina

```powershell
$env:SOURCE_DATABASE_URL = "postgresql://..."  # Supabase pooler
.\scripts\migration\dump-supabase-core.ps1

$env:TARGET_DATABASE_URL = "postgresql://..."    # Easypanel
.\scripts\migration\restore-postgres-core.ps1
```

Conferir: `scripts/migration/verify-core-data.sql`.

## Parte C — Dados operacionais

Expandir `core-data-tables.txt` ou dump por schema `public` (data-only) das tabelas restantes. Sempre:

- `--no-owner --no-privileges`
- Destino com schema idêntico
- Validar contagens: `SELECT count(*) FROM reservations;` origem vs destino

## Parte D — Storage

1. Listar buckets no Supabase Storage.
2. Copiar para volume do `pms-backend` (`/app/storage`), preservando paths usados pela app.
3. Health check Nest: storage ping em `/functions/v1/health-check`.

## Parte E — Validar em staging

1. Backend + worker: `DATABASE_URL` = destino; **não** alterar produção ainda.
2. Fluxos: [critical-flows-e2e.md](./critical-flows-e2e.md).
3. Checklist: [../../deploy/easypanel/CHECKLIST.md](../../deploy/easypanel/CHECKLIST.md).

## Parte F — Cutover produção (janela)

1. Comunicar janela.
2. Pausar escritas se possível (manutenção).
3. Dump final das tabelas mutáveis desde o último sync.
4. Restore no Postgres Easypanel.
5. Atualizar **só** `DATABASE_URL` em `pms-backend` e `pms-worker`.
6. Confirmar Redis e `JWT_SECRET` iguais (sessões ativas).
7. Smoke tests em 15 minutos.
8. Manter Supabase **read-only** 7–14 dias; depois desativar projeto (não apagar até backup frio).

## Rollback (durante janela)

1. Reverter `DATABASE_URL` para Supabase nos serviços API/worker.
2. Restart backend + worker.
3. Investigar destino offline; não executar `DROP DATABASE`.

Backup/restore volume: [../../deploy/easypanel/BACKUP-RESTORE.md](../../deploy/easypanel/BACKUP-RESTORE.md).
