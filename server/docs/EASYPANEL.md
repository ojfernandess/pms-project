# Deploy do PMS API Server no EasyPanel (VPS)

Este serviço é o backend **Node.js + Fastify** em `server/`, com rotas diretas em `/api/*` e `/health`, usando **Postgres e Auth no Supabase** com `SUPABASE_SERVICE_ROLE_KEY` no servidor.

## Pré-requisitos

- Projeto Supabase ativo (URL + service role + anon key se usar JWT no hook opcional).
- Domínio ou subdomínio apontando para o VPS (ex.: `api.seudominio.com`).
- Repositório Git acessível pelo EasyPanel.

## Variáveis de ambiente (produção)

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `SUPABASE_URL` | Sim | URL do projeto (`https://xxx.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | **Só no servidor.** Nunca no browser. |
| `SUPABASE_ANON_KEY` | Recomendado | Para validar `Authorization: Bearer <jwt>` nas rotas protegidas da API. |
| `PORT` | Não | EasyPanel costuma definir `PORT`; o servidor usa `process.env.PORT` (padrão `8787`). |
| `NODE_ENV` | Sim | `production`. |
| `CORS_ORIGINS` | Sim | Lista separada por vírgulas: `https://app.seudominio.com,https://www.seudominio.com`. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Não | Limite por IP (padrão 120 req / 60s). |
| `FUNCTIONS_INVOKE_BASE_URL` | Opcional | Base para proxy de funções legadas ainda não reescritas. |

## Opção A — Dockerfile (recomendado)

1. No EasyPanel: **Create Resource** → **App** → escolha **Dockerfile**.
2. **Root directory**: `server` (ou monorepo com contexto na raiz e Dockerfile que faz `COPY server` — o Dockerfile atual assume build dentro de `server/`).
3. **Dockerfile path**: `server/Dockerfile`.
4. Defina as variáveis de ambiente acima.
5. **Port**: igual à variável `PORT` exposta (ex.: `8787` ou a que o painel injetar).
6. **Health check**: HTTP GET `http://127.0.0.1:$PORT/health` (o Dockerfile já inclui `HEALTHCHECK` interno).

### Build local

```bash
cd server
docker build -t pms-api .
docker run --rm -p 8787:8787 --env-file .env pms-api
```

## Opção B — Nixpacks

Se preferir build sem Dockerfile:

1. **Build command**: `cd server && npm ci && npm run build`
2. **Start command**: `cd server && node dist/index.js`
3. **Node version**: 20+
4. Defina `NIXPACKS_NODE_VERSION=20` (ou equivalente no painel).

Exemplo de `nixpacks.toml` na pasta `server/` (opcional):

```toml
[phases.setup]
nixPkgs = ["nodejs_20"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "node dist/index.js"
```

## Reverse proxy / TLS

- Termine TLS no Traefik/Caddy/nginx do EasyPanel e encaminhe para o container na porta interna.
- Ative **trust proxy** já configurado no Fastify (`trustProxy: true`) para IP real e rate limit corretos.

## Frontend (Vite)

Defina no `.env` de produção do frontend:

```env
VITE_PMS_API_URL=https://api.seudominio.com
```

O frontend deve chamar diretamente os endpoints da API Node (`/api/...`) via utilitário central (`src/lib/pmsApi.ts`).

## Verificação pós-deploy

- `GET https://api.seudominio.com/health`
- `POST https://api.seudominio.com/api/pagamentos/stripe/intent`
- `POST https://api.seudominio.com/api/webhooks/stripe`

## CI

Workflow GitHub: `.github/workflows/server-ci.yml` (testes + build ao alterar `server/`).
