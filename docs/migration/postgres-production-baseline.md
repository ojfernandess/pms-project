# Baseline: Postgres de produção como instalação padrão

Objetivo: **congelar** o schema (e opcionalmente dados de referência) do Postgres que já está em produção (Easypanel) e reaplicar em **novos ambientes**, **Docker local** ou **novos builds**, sem depender do Supabase nem de import `force` a cada deploy.

## O que incluir no baseline

| Artefacto | Conteúdo | Commitar no Git? |
|-----------|----------|------------------|
| **Schema** (`*.schema.dump`) | Tabelas, tipos, enums, funções, triggers, índices (`public` + `auth`) | Não (grande). Release, LFS, S3 ou build-time secret |
| **GRANTs** | Já no repo: `backend/scripts/migration/grant-app-roles.sql` | Sim |
| **Patch RPC** | `backend/scripts/migration/rpc/*` + `ensure-bundled-rpcs` | Sim (correções pós-baseline) |
| **Dados** (`*.data.dump`) | Só dev/staging; **nunca** produção completa com PII no Git | Não |

Produção Easypanel = **fonte da verdade** depois do cutover. Atualize o baseline quando houver migrações SQL relevantes em produção.

## Passo 1 — Exportar da produção (uma vez, depois quando mudar o schema)

**Ligação:** use pooler **session :5432** (não transaction :6543 para `pg_dump`).

PowerShell (Windows), na raiz do repo:

```powershell
$env:SOURCE_DATABASE_URL = "postgresql://postgres:SENHA@HOST:5432/NOME_DB"  # Easypanel / túnel
.\scripts\migration\export-postgres-baseline.ps1
```

Bash:

```bash
export SOURCE_DATABASE_URL="postgresql://..."
./scripts/migration/export-postgres-baseline.sh
```

Saída (gitignored): `postgres-dumps/pms-baseline-YYYYMMDD.schema.dump` + `postgres-dumps/baseline-manifest.json`.

Opcional — dados mínimos para dev (tabelas em `core-data-tables.txt`):

```powershell
.\scripts\migration\export-postgres-baseline.ps1 -IncludeCoreData
```

## Passo 2 — Onde guardar para “futuros builds”

Escolha **uma** estratégia:

### A) Artefacto fora do Git (recomendado para produção)

1. Upload do `.schema.dump` para storage (S3, R2, volume Easypanel, GitHub Release).
2. No **primeiro arranque** do backend vazio:
   - `APP_APPLY_POSTGRES_BASELINE=once`
   - `POSTGRES_BASELINE_URL=https://.../pms-baseline.schema.dump` (ou caminho no volume)

### B) Ficheiro no volume Easypanel

1. Copie `pms-baseline-*.schema.dump` para o volume montado em `/app/storage/baseline/`.
2. Env:
   ```env
   APP_APPLY_POSTGRES_BASELINE=once
   POSTGRES_BASELINE_FILE=/app/storage/baseline/pms-baseline.schema.dump
   ```

### C) Dentro da imagem Docker (staging/CI)

No `backend/Dockerfile` (só se o dump for pequeno ou ambiente interno):

```dockerfile
COPY postgres-dumps/pms-baseline.schema.dump /app/postgres-baseline/pms-baseline.schema.dump
```

Build local exige o ficheiro presente antes do `docker build`.

### D) Docker Compose local (Postgres vazio)

Monte o dump no init do Postgres **ou** aplique via backend:

```yaml
# ex.: postgres-baseline/ com dump e manifest
```

Ver [deploy/LOCAL_DOCKER.md](../../deploy/LOCAL_DOCKER.md).

## Passo 3 — Aplicar em Postgres vazio

Ordem (o entrypoint do backend segue isto):

1. `bootstrap-target-postgres.sql` (roles `anon` / `authenticated` / `service_role`)
2. **`APP_APPLY_POSTGRES_BASELINE=once`** → `pg_restore --schema-only` do dump
3. `auth-compat.sql` + `ensure-bundled-rpcs` (patch se o dump ficou atrás do código)
4. `grant-app-roles.sql` se `APP_RUN_DB_GRANTS=true`
5. Dados: restore `.data.dump` manual ou import separado

Variáveis:

| Variável | Valores | Notas |
|----------|---------|--------|
| `APP_APPLY_POSTGRES_BASELINE` | `once` \| `force` \| vazio | `once` usa marcador `.postgres-baseline-applied` |
| `POSTGRES_BASELINE_FILE` | caminho `.dump` custom | default procura em `postgres-dumps/` ou `/app/postgres-baseline/` |
| `PMS_MIGRATION_COMPLETE` | `true` após OK | Desliga imports Supabase |

## Passo 4 — Novos deploys (Easypanel)

**Postgres já com dados (produção atual):** não reaplique baseline (`APP_APPLY_POSTGRES_BASELINE` vazio).

**Novo serviço Postgres / disaster recovery:**

```env
DATABASE_URL=postgresql://...@novo-postgres:5432/...
APP_APPLY_POSTGRES_BASELINE=once
POSTGRES_BASELINE_FILE=/app/storage/baseline/pms-baseline.schema.dump
PRISMA_MIGRATE_ON_START=false
APP_APPLY_BUNDLED_RPCS=auto
PMS_MIGRATION_COMPLETE=true
```

Uma réplica no backend até o marcador existir.

## Passo 5 — Evolução do schema (dia a dia)

| Situação | O que fazer |
|----------|-------------|
| Alterou SQL em produção (manual / migração) | Novo `export-postgres-baseline` + versionar manifest |
| Alterou só código RPC no Git | `ensure-bundled-rpcs` cobre o delta |
| Novas migrações em `supabase/migrations/` | Aplicar em prod **ou** adicionar ao bundled; depois **re-exportar** baseline |

O Prisma (`backend/prisma/migrations`) cobre apenas sessões/healthcheck Nest — **não** substitui o baseline PMS.

## Relação com o que já existia

| Mecanismo antigo | Substituído por baseline? |
|------------------|---------------------------|
| `APP_IMPORT_SUPABASE_SCHEMA=once` | Sim, se a origem for prod Easypanel |
| `APP_IMPORT_SUPABASE_DATA=force` | Não automaticamente — use data dump ou import pontual |
| RPCs bundled | Mantém-se como **patch** após baseline |

## Segurança

- Não commitar `SOURCE_DATABASE_URL`, dumps com dados reais nem secrets.
- `postgres-dumps/` está no `.gitignore`.
- Dumps de dados: anonimizar ou usar subset (`core-data-tables.txt`).