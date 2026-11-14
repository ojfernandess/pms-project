# Easypanel — criar cada serviço (passo a passo)

Repositório Git: o mesmo monorepo. Ordem sugerida: **Redis → Postgres (se aplicável) → Backend → Worker → Frontend**.

Substitua `seudominio.com` e os nomes de serviço pelos seus.

---

## 1. Redis (`redis`)

1. **Create Service** → **Redis** (ou App com imagem `redis:7-alpine`).
2. Nome sugerido: `redis`.
3. Ative **persistência/volume** se quiser dados de fila após restart.
4. **Não** publique a porta 6379 na internet.
5. Copie a URL interna (ex. `redis://default:PASSWORD@redis:6379`).
6. Use essa URL em `REDIS_URL` no backend e no worker.

Variáveis modelo: [../env/redis.env.example](../env/redis.env.example).

---

## 2. PostgreSQL (`postgres`) — opcional

Use **apenas** se o banco for gerido no Easypanel. Se continuar com Supabase/pooler, defina só `DATABASE_URL` no backend/worker apontando para o host externo.

1. **Create Service** → **PostgreSQL**.
2. Nome: `postgres`.
3. Defina `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` no painel.
4. Monte volume persistente; **não** recrie o volume em migração.
5. Connection string interna: `postgresql://USER:PASS@postgres:5432/DB`.

Modelo: [../env/postgres.env.example](../env/postgres.env.example).

---

## 3. Backend (`backend`)

1. **Create Service** → **App**.
2. Nome: `backend` (o hostname interno usará este nome).
3. **Source:** Git → branch de produção.
4. **Dockerfile path:** `backend/Dockerfile`.
5. **Context / root:** diretório `backend` (ou raiz com Dockerfile path `backend/Dockerfile` conforme o painel).
6. **Porta do container:** `3000`.
7. **Domínio (opcional mas recomendado):** `api.seudominio.com` → para webhooks (`/functions/v1/*`).
8. **Volume:** montar `/app/storage` (uploads).
9. **Health check (se o painel permitir override):** HTTP `GET /health` na porta 3000.

**Environment (runtime)** — copie de [../env/backend.env.example](../env/backend.env.example):

| Variável | Exemplo |
| --- | --- |
| `DATABASE_URL` | pooler Supabase ou `postgresql://...@postgres:5432/pms` |
| `REDIS_URL` | URL do passo 1 |
| `JWT_SECRET` | ≥ 32 caracteres |
| `PORT` | `3000` |
| `PRISMA_MIGRATE_ON_START` | `false` se base já existir |
| `PUBLIC_APP_URL` | `https://app.seudominio.com` |
| `INTERNAL_API_TOKEN` | token forte |
| `SOCKET_AUTH_TOKEN` | token forte (produção) |

**Start command:** padrão da imagem (`docker-entrypoint.sh` → `node dist/main.js`).

---

## 4. Worker (`worker`)

1. **Create Service** → **App**.
2. Nome: `worker`.
3. **Mesmo repositório** e **mesmo** `backend/Dockerfile` (pode reutilizar imagem do backend se o Easypanel permitir).
4. **Sem domínio** e **sem porta publicada**.
5. **Start command (override)** — não use o entrypoint da API (`docker-entrypoint.sh` chama `main.js`):

```sh
./scripts/docker-entrypoint-worker.sh
```

Ou: `node dist/worker.js`

Se o worker arrancar com o mesmo comando da API, existem **duas APIs** e o pool Supabase (15 sessões) esgota rápido.

6. **Environment:** igual ao backend (ver [../env/worker.env.example](../env/worker.env.example)), especialmente `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, tokens internos.

Reinicie o worker sem afetar a API.

---

## 5. Frontend (`frontend`)

1. **Create Service** → **App**.
2. Nome: `frontend`.
3. **Dockerfile path:** `Dockerfile` (raiz do repositório).
4. **Porta do container:** `80`.
5. **Domínio:** `app.seudominio.com`.

### Build args (obrigatório no build)

| Build arg | Valor |
| --- | --- |
| `VITE_PMS_API_URL` | `https://app.seudominio.com` (modo A) ou `https://api.seudominio.com` (modo B) |
| `VITE_APP_URL` | `https://app.seudominio.com` |
| `VITE_SUPABASE_URL` | vazio |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | vazio |

### Environment runtime (container)

| Variável | Valor |
| --- | --- |
| `BACKEND_UPSTREAM` | `http://backend:3000` (nome do serviço API na rede interna) |

Ao **alterar só** `BACKEND_UPSTREAM`, basta **restart** do frontend (sem rebuild).  
Ao **alterar** `VITE_*`, é obrigatório **rebuild**.

Modelo completo: [../env/frontend.env.example](../env/frontend.env.example).

---

## Resumo visual no Easypanel

```
Projeto: PMS StayOS
├── redis        (Redis)
├── postgres     (PostgreSQL) — opcional
├── backend      (App, :3000, api.*)
├── worker       (App, sem porta)
└── frontend     (App, :80, app.*)
```

Rede: [NETWORK.md](NETWORK.md).

Validação: [CHECKLIST.md](CHECKLIST.md).
