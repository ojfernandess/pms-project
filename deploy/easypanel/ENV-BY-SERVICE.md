# Variáveis de ambiente por serviço (Easypanel)

Sem valores reais. Copie para o painel de cada serviço.

## pms-postgres (PostgreSQL)

Geridas pelo Easypanel ao criar o serviço. Anote:

- Utilizador (geralmente `postgres`)
- Palavra-passe gerada
- Nome da base (geralmente = nome do projeto Easypanel)
- Host interno: `$(PROJECT_NAME)_pms-postgres:5432`

**Não** publique a porta 5432 na internet.

---

## pms-redis (Redis)

- URL gerada: `redis://default:SENHA@$(PROJECT_NAME)_pms-redis:6379`
- Repetir em backend e worker como `REDIS_URL`

---

## pms-backend (App)

| Variável | Obrigatória | Notas |
| --- | --- | --- |
| `PORT` | Sim | `3000` |
| `NODE_ENV` | Sim | `production` |
| `DATABASE_URL` | Sim | Postgres interno ou pooler |
| `REDIS_URL` | Sim | URL Redis interna |
| `JWT_SECRET` | Sim | ≥ 32 caracteres; igual ao worker |
| `JWT_ACCESS_TTL` | Sim | ex. `15m` |
| `JWT_REFRESH_TTL_DAYS` | Sim | ex. `7` |
| `INTERNAL_API_TOKEN` | Sim | Filas / chamadas internas |
| `SOCKET_AUTH_TOKEN` | Recomendado | Socket.IO |
| `PUBLIC_APP_URL` | Sim | URL do frontend |
| `SITE_URL` | Sim | Idem |
| `PRISMA_MIGRATE_ON_START` | Sim | `false` após dump Supabase; `true` só em BD vazia + estratégia Prisma acordada |
| `CORS_ORIGINS` | Opcional | Se API em domínio diferente do SPA |
| `STORAGE_DIR` | Opcional | Default `/app/storage` — montar volume |
| `SUPABASE_URL` | Não | Vazio após cutover |
| `SUPABASE_ANON_KEY` | Não | Vazio |
| `SUPABASE_SERVICE_ROLE_KEY` | Não | Substituir por `INTERNAL_API_TOKEN` |

---

## pms-worker (App)

Mesmas variáveis críticas do backend, **exceto** `PORT` e `PRISMA_MIGRATE_ON_START` (não necessário).

**Comando:** `node dist/worker.js`

---

## pms-frontend (App)

### Build (rebuild obrigatório ao mudar)

| Build arg / env no build | Valor típico |
| --- | --- |
| `VITE_PMS_API_URL` | `https://app.seudominio.com` (modo proxy) |
| `VITE_APP_URL` | Igual ao SPA |
| `VITE_SUPABASE_URL` | vazio |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | vazio |

### Runtime (restart sem rebuild)

| Variável | Valor típico |
| --- | --- |
| `BACKEND_UPSTREAM` | `http://$(PROJECT_NAME)_pms-backend:3000` |

---

## Paridade na migração Supabase → Postgres próprio

| Antes (Supabase) | Depois (Easypanel) |
| --- | --- |
| `DATABASE_URL` pooler `*.supabase.com` | `postgresql://postgres:...@..._pms-postgres:5432/...` |
| `VITE_SUPABASE_URL` | vazio |
| Secrets `SUPABASE_SERVICE_ROLE_KEY` | `INTERNAL_API_TOKEN` |
| Storage cloud | Volume `/app/storage` |
