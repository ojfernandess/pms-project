# Deploy no Easypanel (PMS Nest + React)

Depois da migração, o PMS **não** é só o frontend: o browser fala com o **NestJS** (`VITE_PMS_API_URL`). O Postgres pode continuar remoto (ex. pooler Supabase em `DATABASE_URL`); no Easypanel costumas criar **vários serviços** num projeto.

## Arquitetura recomendada

| Serviço Easypanel | Origem | Porta | Função |
| --- | --- | --- | --- |
| **pms-web** | `Dockerfile` (raiz do repo) | **80** | React estático + nginx |
| **pms-api** | `backend/Dockerfile` | **3000** | API Nest (auth, `/rest/v1`, `/functions/v1`, Socket.IO) |
| **pms-worker** | `backend/Dockerfile` (mesma imagem) | — | BullMQ: digest diário, lembretes checkout |
| **redis** | App Redis do Easypanel ou imagem `redis:7-alpine` | **6379** | Sessão, filas, adapter Socket.IO, cache tarifas |

O **Postgres** não precisa de contentor no Easypanel se já usas `DATABASE_URL` para um servidor gerido (Supabase pooler ou VPS). O `docker-compose.yml` na raiz é referência **local** (Postgres + Redis + tudo junto).

```mermaid
flowchart LR
  Browser --> pms_web
  pms_web -->|VITE_PMS_API_URL| pms_api
  pms_api --> Postgres
  pms_api --> Redis
  pms_worker --> Postgres
  pms_worker --> Redis
```

---

## 1. Redis

Cria um serviço Redis (Easypanel ou Docker). Anota a URL, por exemplo:

`redis://default:senha@redis:6379`

Usa a mesma URL em **pms-api** e **pms-worker**.

---

## 2. pms-api (backend)

1. **App** → Build from Git → Dockerfile path: `backend/Dockerfile`.
2. **Porta exposta:** `3000`.
3. **Variáveis de runtime** (obrigatórias — ver `backend/.env.example`):

| Variável | Notas |
| --- | --- |
| `DATABASE_URL` | Connection string Postgres (session pooler `:5432` se for Supabase). |
| `REDIS_URL` | URL do Redis acima. |
| `JWT_SECRET` | Mínimo 32 caracteres. |
| `JWT_ACCESS_TTL` | Ex.: `15m` |
| `JWT_REFRESH_TTL_DAYS` | Ex.: `7` |
| `PORT` | `3000` |
| `INTERNAL_API_TOKEN` | Chamadas internas / workers. |
| `SOCKET_AUTH_TOKEN` | Opcional em dev; em produção define um token forte para testes/infra. |
| `PUBLIC_APP_URL` | URL pública do **frontend** (logos, links de e-mail). Ex.: `https://app.seudominio.com` |

Variáveis **opcionais** (lidas de `process.env`, não estão todas no `validateEnv`):

- Segredos Stripe, FNRH, Bukly, Aiosell, Channex, SMTP — conforme o estabelecimento usa esses canais.
- `STORAGE_DIR` — diretório para ficheiros (`backend/storage`). Monta **volume persistente** no Easypanel se não quiseres perder uploads ao redeploy.
- `SUPABASE_SERVICE_ROLE_KEY` — só para jobs que comparam bearer interno (ex. ack worker); **não** expor no frontend.

4. **Arranque:** o `backend/Dockerfile` corre `npx prisma migrate deploy` antes de `node dist/main.js`. Só use contra a base que pretende migrar; em produção Supabase, confirma que as migrações do repo são compatíveis com o que já está aplicado.

5. **Domínio:** ex. `https://api.seudominio.com` → apontar ao serviço na porta 3000.

CORS do Nest aceita `origin: true`; o frontend em outro domínio funciona desde que o browser use `VITE_PMS_API_URL` nesse host.

---

## 3. pms-worker

1. Mesmo repositório e **mesmo** `backend/Dockerfile` que a API (podes reutilizar a imagem construída).
2. **Comando** (override no Easypanel):

```sh
node dist/worker.js
```

Não precisas de expor porta. As mesmas envs que a API (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `INTERNAL_API_TOKEN`, etc.).

O worker agenda `send-daily-digest` e `send-checkout-reminders` via BullMQ (substitui crons Supabase quando estiverem desligados na base).

---

## 4. pms-web (frontend)

1. **App** → Dockerfile na **raiz** do repositório.
2. **Porta:** `80`.
3. **Build args / env no build** — o Vite embute `VITE_*` no bundle; mudança exige **rebuild**.

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `VITE_PMS_API_URL` | **Sim** | URL pública da API. Ex.: `https://api.seudominio.com` |
| `VITE_APP_URL` | Sim | URL desta app (SPA). Ex.: `https://app.seudominio.com` |
| `VITE_SUPABASE_URL` | Legado | Pode ficar vazio se tudo passa pelo Nest; alguns ecrãs ainda referem o texto “Supabase”. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Legado | Idem; o cliente Nest não chama `supabase.co` para dados. |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | **Não** | Evitar no browser em produção. |
| `VITE_USE_RATE_CALENDAR_SUMMARY` | Não | `true` / `1` se usares esse modo. |

`VITE_PMS_API_URL` tem de coincidir com o domínio do **pms-api** (sem barra final).

---

## Verificação local (stack completa)

```powershell
Set-Location "caminho\para\pms-project-main"
docker compose build
docker compose up
```

- Frontend: `http://localhost:8080`
- API: `http://localhost:3000`

Para só o frontend:

```sh
docker build \
  --build-arg VITE_PMS_API_URL=https://api.seudominio.com \
  --build-arg VITE_APP_URL=https://app.seudominio.com \
  --build-arg VITE_SUPABASE_URL= \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY= \
  -t pms-frontend .

docker run --rm -p 8080:80 pms-frontend
```

---

## O que **não** vai para o contentor do frontend

- NestJS, Prisma, Redis, worker BullMQ, Postgres.
- Ficheiros antigos do Supabase Storage — copies novos para `STORAGE_DIR` do API ou migração à parte.

---

## Ficheiros relevantes

| Ficheiro | Uso |
| --- | --- |
| `Dockerfile` | Build Vite + nginx (pms-web) |
| `nginx.conf` | SPA `try_files` |
| `backend/Dockerfile` | API + base para worker |
| `docker-compose.yml` | Desenvolvimento local com Postgres/Redis |
| `backend/.env.example` | Lista de envs da API/worker |
