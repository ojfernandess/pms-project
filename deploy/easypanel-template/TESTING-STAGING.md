# Validação em staging (Easypanel) — passo a passo

Execute isto **num projeto novo** no Easypanel (ex. `pms-staging`). **Não** desinstale a stack Compose de produção até concluir o [CHECKLIST](../easypanel/CHECKLIST.md).

## Pré-requisitos verificados

| Item | Status |
| --- | --- |
| Repositório `ojfernandess/pms-project` | Público (GitHub API) |
| Branch `PMS-Backend` | Existe (último commit com fixes de deploy/API) |
| Easypanel | Conta com **GitHub conectado** (Settings → GitHub) |

Se o repo passar a **privado**, ligue a integração GitHub no Easypanel com acesso ao repositório.

## 0. Publicar ficheiros do template no Git

O builder clona o GitHub — o monorepo precisa conter `deploy/`, `Dockerfile`, `backend/Dockerfile`, `deploy/frontend/nginx.conf.template`.

```powershell
cd "d:\Projects Cursor\pms-project-main"
git status
git add deploy/
git commit -m "feat(deploy): template Easypanel one-click e nginx BACKEND_UPSTREAM"
git push origin PMS-Backend
```

(Commit só quando quiser; este passo é obrigatório antes do build remoto.)

## 1. Gerar JSON do template

### Cenário A — PostgreSQL próprio no Easypanel (alvo final, 5 serviços)

```powershell
node deploy/easypanel-template/scripts/export-template-json.mjs --input deploy/easypanel-template/staging/input-easypanel-postgres.default.json --out deploy/easypanel-template/output/stayos-postgres.json
```

Depois do deploy: aplicar schema + [easypanel-postgres-cutover.md](../../docs/migration/easypanel-postgres-cutover.md).

### Cenário B — Transitório (API ainda no Supabase)

Só enquanto o Postgres Easypanel não tiver dados restaurados:

```powershell
copy deploy\easypanel-template\staging\input-transitional-supabase.example.json deploy\easypanel-template\staging\input-transitional.local.json
# Edite externalDatabaseUrl
node deploy/easypanel-template/scripts/export-template-json.mjs --input deploy/easypanel-template/staging/input-transitional.local.json --out deploy/easypanel-template/output/stayos-transitional.json
```

Valide a estrutura:

```powershell
node deploy/easypanel-template/scripts/validate-template-json.mjs deploy/easypanel-template/output/stayos-supabase.json
```

## 2. Criar projeto no Easypanel

1. **Projects** → **Create** → nome: `pms-staging`.
2. **Create from template** / **Import JSON** (conforme a sua versão do painel).
3. Cole o conteúdo de `output/stayos-supabase.json` (ou o ficheiro gerado).
4. Confirme **5 serviços** (cenário A — com `pms-postgres`):
   - `pms-redis`
   - `pms-backend`
   - `pms-worker`
   - `pms-frontend`
5. Defina o **domínio primário** do projeto para o frontend (ex. subdomínio de staging).

## 3. Ordem de deploy sugerida

1. **Redis** — Start; aguarde healthy.
2. **Backend** — primeiro build (5–15 min). **Subir o backend antes do frontend** evita erro nginx `host not found in upstream` em versões antigas da imagem (versões recentes usam `resolver 127.0.0.11` + proxy dinâmico).
   - `Skipping prisma migrate deploy` ou migrate OK
   - `PostgreSQL connected` / `Redis connected`
   - `API listening on :3000`
3. **Worker** — Start (pode reutilizar imagem do backend após build).
4. **Frontend** — build com `VITE_*`; logs nginx sem erro de template.

Se o backend falhar no build: **Deployments** → verificar clone da branch `PMS-Backend` e path `/backend`.

## 4. Testes mínimos

| Teste | Como |
| --- | --- |
| Health | `https://SEU-DOMINIO/health` (proxy nginx) |
| Login | UI → login |
| API | DevTools → `POST .../auth/login`, `POST .../rest/v1/query` |
| Worker | Logs sem erro Redis; restart do worker não derruba API |

## 5. Ajustes pós-instalação (painel)

No serviço **pms-backend** (sem rebuild):

- `CORS_ORIGINS` se usar domínio da API separado
- `PUBLIC_APP_URL` = URL exata do SPA

No **pms-frontend** (só restart):

- `BACKEND_UPSTREAM=http://<nome-projeto>_pms-backend:3000` (o template já usa `$(PROJECT_NAME)_pms-backend`)

Domínio **API** para webhooks (opcional):

- Adicione domínio `api.staging...` no serviço backend, porta `3000`.

## 6. Cutover produção

Só após checklist verde e período estável em staging: [../easypanel/MIGRATION.md](../easypanel/MIGRATION.md).

**Não** apague volumes da stack Compose antiga até rollback não ser mais necessário.

## Troubleshooting

| Sintoma | Ação |
| --- | --- |
| Build Git 404 | Repo privado sem token GitHub no Easypanel |
| P3005 no backend | `PRISMA_MIGRATE_ON_START=false` + SQL `scripts/migration/prisma-nest-tables.sql` no Supabase |
| 502 no login | `BACKEND_UPSTREAM` ou backend down; conferir nome `$(PROJECT_NAME)_pms-backend` |
| CORS | `VITE_PMS_API_URL` = URL do browser; igual a `VITE_APP_URL` no modo proxy |
