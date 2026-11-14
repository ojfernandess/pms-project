# Deploy no Easypanel (PMS Nest + React)

## Template One-Click (como Chatwoot)

Instala automaticamente os 5 serviços via `generate()` do Easypanel:

- [deploy/easypanel-template/README.md](../deploy/easypanel-template/README.md)
- `node deploy/easypanel-template/scripts/export-template-json.mjs` → JSON para testes no painel

## Serviços independentes (recomendado em produção)

Para gerir **backend**, **frontend**, **worker**, **Redis** e **Postgres** cada um com env, logs e restart próprios no Easypanel, use:

- [deploy/README.md](../deploy/README.md) — diagnóstico e visão geral  
- [deploy/easypanel/SERVICES.md](../deploy/easypanel/SERVICES.md) — passo a passo por serviço  
- [deploy/easypanel/MIGRATION.md](../deploy/easypanel/MIGRATION.md) — migrar da stack Compose  
- [deploy/easypanel/CHECKLIST.md](../deploy/easypanel/CHECKLIST.md) — validação  
- [deploy/env/](../deploy/env/) — `.env.example` por componente  

O frontend usa `BACKEND_UPSTREAM` em **runtime** (proxy nginx) — ver `deploy/frontend/nginx.conf.template`.

---

## Docker Compose no Easypanel (stack `pms-stayos`)

Se usas **um projeto Compose** com o `docker-compose.yml` da raiz:

### Erro «port is already allocated» (3000, 5432, …)

O Compose **não publica mais portas no host** (`0.0.0.0:3000`). O proxy do Easypanel encaminha por **domínio → porta interna do contentor** (`backend:3000`, `frontend:80`). Atualiza o repo (branch `PMS-Backend`) e faz redeploy.

### Variáveis de ambiente (um painel para o stack)

O Easypanel Compose costuma ter **uma** lista **Environment** do projeto — não por serviço. Isso basta: o `docker-compose.yml` usa `${DATABASE_URL}`, `${JWT_SECRET}`, etc. no `backend` e no `worker`, e `${VITE_*}` no **build** do `frontend`.

1. Copia o modelo [`.env.example`](../.env.example) para o Environment do projeto (ou ficheiro `.env` no servidor, conforme o painel).
2. **Defina no Environment antes do primeiro deploy estável** (o compose aceita defaults só para o build passar; em produção **tem** de preencher):
   - `DATABASE_URL` — pooler Postgres (`:5432`)
   - `JWT_SECRET` — ≥ 32 caracteres (não use o default de desenvolvimento)
   - `REDIS_URL` — `redis://redis:6379` se usas o Redis do mesmo compose
   - `VITE_PMS_API_URL` — URL pública da API (domínio que apontas ao serviço **backend**)
   - `VITE_APP_URL` — URL pública do **frontend**
   - `PUBLIC_APP_URL` — igual ao front, para links no servidor
3. **Rebuild** após mudar `VITE_*` (são embutidas no build do frontend).

O serviço **postgres** do compose só arranca com o profile `local-db` (desenvolvimento local). No Easypanel **não** uses esse profile — só Redis interno + API + worker + front; dados em `DATABASE_URL` externo.

### Domínios no Easypanel

| Serviço Compose | Porta interna | Exemplo de domínio |
| --- | --- | --- |
| `frontend` | **80** | `app.seudominio.com` |
| `backend` | **3000** | `api.seudominio.com` (webhooks / integrações; opcional para o browser) |

O `worker` não precisa de domínio nem porta publicada.

**Browser sem CORS (recomendado no Compose):** o `nginx.conf` do frontend faz proxy de `/rest`, `/auth`, `/functions`, `/storage` e `/socket.io` para `backend:3000`. Defina no build `VITE_PMS_API_URL` **igual** a `VITE_APP_URL` (ex. `https://sandbox.stayos.com.br`). Mantém `api.seudominio.com` só para webhooks externos.

**Erro «blocked by CORS» com `VITE_PMS_API_URL` noutro domínio:** no DevTools, abra o pedido **OPTIONS** — se o status for **502** ou HTML do Easypanel, o proxy não está a chegar ao Nest (não é falta de header). Corrija o domínio da API → serviço `backend:3000`. Se for **200/204** sem `Access-Control-Allow-Origin`, no backend defina `PUBLIC_APP_URL` e `CORS_ORIGINS=https://sandbox.stayos.com.br` e faça redeploy da API.

### Aviso «problemas na configuração do Docker Compose»

Clica **Visualizar**: muitas vezes faltam variáveis obrigatórias (`DATABASE_URL`, `JWT_SECRET`, `VITE_PMS_API_URL`, …) ou o override antigo ainda mapeava a porta 3000 no host.

---

Depois da migração, o PMS **não** é só o frontend: o browser fala com o **NestJS** (`VITE_PMS_API_URL`). O Postgres pode continuar remoto (ex. pooler Supabase em `DATABASE_URL`); também podes usar **vários serviços** separados no Easypanel (sem Compose) — secções abaixo.

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

4. **Arranque / Prisma:** com `DATABASE_URL` no **Supabase** (base já cheia), define `PRISMA_MIGRATE_ON_START=false` — senão o contentor morre com **P3005** e o domínio da API devolve **502**. Corre uma vez o SQL em [scripts/migration/prisma-nest-tables.sql](../scripts/migration/prisma-nest-tables.sql) no SQL Editor do Supabase (tabelas de refresh token e reset de password). Postgres **vazio** no compose (`local-db`): `PRISMA_MIGRATE_ON_START=true`.

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

**Easypanel — URL da API só no Environment (sem rebuild):** a imagem a partir do commit com `runtime-config.js` lê `VITE_PMS_API_URL` ou `PMS_API_URL` **na subida do contentor** e o browser usa `https://api...` via `resolvePmsApiUrl()`. Após deploy, confira `https://sandbox.../runtime-config.js` no browser.

---

## Verificação local (stack completa)

```powershell
Set-Location "caminho\para\pms-project-main"
Copy-Item .env.example .env   # ajuste DATABASE_URL se usar Postgres do compose
docker compose --profile local-db -f docker-compose.yml -f docker-compose.local.yml up --build
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
