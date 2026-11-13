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
