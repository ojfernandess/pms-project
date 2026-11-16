# Docker local (stack completa)

## O que foi validado

| Item | Estado |
|------|--------|
| `docker compose config` (profile `local-db`) | OK |
| `docker build` backend (`backend/Dockerfile`) | OK |
| `docker build` frontend (raiz `Dockerfile`) | OK |
| Redis + healthchecks no compose | OK |
| Proxy nginx `/rest`, `/auth`, `/functions` | OK |
| Proxy nginx `/reservations`, `/rates`, `/establishments`, `/companies` | OK (modo mesma origem) |

## Subir a stack

```bash
# Na raiz do repositório — use .env sem apontar a Supabase se quiser Postgres local
docker compose --profile local-db -f docker-compose.yml -f docker-compose.local.yml up --build
```

| Serviço | URL no host |
|---------|-------------|
| Frontend (nginx) | http://localhost:8080 |
| API (Nest) | http://localhost:3000 |
| Postgres | localhost:5432 (`pms` / `pms` / `pms`) |
| Redis | localhost:6379 |

## Variáveis recomendadas (`.env` na raiz)

### Opção A — Postgres local (contentor `postgres`)

```env
DATABASE_URL=postgresql://pms:pms@postgres:5432/pms
REDIS_URL=redis://redis:6379
JWT_SECRET=local-development-jwt-secret-32chars-minimo
PRISMA_MIGRATE_ON_START=false
PMS_MIGRATION_COMPLETE=true
APP_APPLY_BUNDLED_RPCS=auto

# API direta no browser (CORS liberado se CORS_ORIGINS vazio)
VITE_PMS_API_URL=http://localhost:3000
VITE_APP_URL=http://localhost:8080
BACKEND_UPSTREAM=http://backend:3000
```

O Prisma só aplica **2 migrações** (`backend/prisma/migrations`). O schema PMS completo vem das migrações `supabase/migrations` ou import (`APP_IMPORT_*`). Postgres vazio **não** basta com `PRISMA_MIGRATE_ON_START=true` para o PMS inteiro.

### Opção B — Banco remoto (Supabase / Easypanel) + API local

```env
DATABASE_URL=postgresql://...@host:5432/postgres
# Não use profile local-db se não quiser o contentor postgres (ou pare o serviço postgres)
VITE_PMS_API_URL=http://localhost:3000
VITE_APP_URL=http://localhost:8080
```

### Opção C — Mesma origem (só :8080 no browser)

```env
VITE_PMS_API_URL=http://localhost:8080
VITE_APP_URL=http://localhost:8080
BACKEND_UPSTREAM=http://backend:3000
```

Rebuild do frontend obrigatório após mudar `VITE_*`.

## Limitações conhecidas

1. **`.env` com `DATABASE_URL` Supabase** + profile `local-db`: o Postgres local sobe mas a API usa o banco remoto (confuso). Para stack 100% local, alinhe `DATABASE_URL` ao contentor `postgres`.
2. **Worker**: o compose usa `node dist/worker.js` (sem entrypoint de migração) — esperado.
3. **Import/migração Easypanel**: variáveis `APP_IMPORT_SUPABASE_DATA=force` etc. não devem ser usadas no `.env` local de desenvolvimento rotineiro.
4. **Tempo de build**: frontend ~5 min, backend ~3 min (primeira vez).

## Smoke test

```bash
curl -s http://localhost:3000/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
```

Login e fluxos PMS exigem schema + dados no `DATABASE_URL` escolhido.