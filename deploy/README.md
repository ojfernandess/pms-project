# Deploy modular (Easypanel) — visão geral

Este diretório descreve como implantar o PMS como **serviços independentes** no Easypanel, sem alterar a lógica da aplicação. O monorepo continua único; a separação é na **infraestrutura de build e runtime**.

## Diagnóstico da infraestrutura atual

| Aspecto | Situação hoje | Impacto |
| --- | --- | --- |
| Orquestração | `docker-compose.yml` único (frontend, backend, worker, redis; postgres com profile `local-db`) | Easypanel Compose expõe **uma** aba de Environment para toda a stack |
| Build frontend | `Dockerfile` na raiz + `VITE_*` em build args | Mudar URL da API exige **rebuild** do frontend |
| Build backend/worker | `backend/Dockerfile` partilhado | Worker = mesmo imagem, comando `node dist/worker.js` |
| Proxy SPA | nginx encaminha `/rest`, `/auth`, etc. para a API | Host fixo `backend:3000` só funciona **dentro** do Compose |
| Dados | `DATABASE_URL` externo (Supabase) ou Postgres local | Migração não deve recriar volumes |
| Health | Nest expõe `GET /health` | Faltava healthcheck nas imagens (adicionado) |

### Riscos da migração (stack única → serviços separados)

1. **`VITE_PMS_API_URL` incorreta** após rebuild → login/CORS ou chamadas para host antigo.
2. **`BACKEND_UPSTREAM` errado** no frontend (modo mesmo domínio) → proxy 502 no browser.
3. **`REDIS_URL` / `DATABASE_URL` com hostname de Compose** (`redis`, `postgres`) após renomear serviços no painel.
4. **`JWT_SECRET` diferente** entre backend e worker → filas/auth inconsistentes.
5. **Volume de storage** não montado no novo serviço backend → perda de uploads no redeploy.
6. **`PRISMA_MIGRATE_ON_START=true`** em base Supabase cheia → crash P3005 (manter `false`).
7. **Downtime** se desligar a stack antiga antes de validar os novos serviços.

**Mitigação:** subir serviços novos em paralelo, validar [CHECKLIST](easypanel/CHECKLIST.md), só então desligar o Compose antigo. Não apagar volumes Postgres/Redis sem backup.

## Template One-Click (Easypanel oficial)

Instalador estilo **Chatwoot** (`meta.yaml` + `index.ts`): [easypanel-template/README.md](easypanel-template/README.md).

- Gere JSON de teste: `node deploy/easypanel-template/scripts/export-template-json.mjs`
- **Não** substitui o `docker-compose.yml` existente.

## Estrutura de ficheiros

```
deploy/
  README.md                 ← este ficheiro
  env/                      ← .env.example por serviço (sem segredos)
  frontend/
    nginx.conf.template     ← proxy API configurável (BACKEND_UPSTREAM)
  easypanel/
    SERVICES.md             ← criar cada serviço no painel
    MIGRATION.md              ← da stack Compose para serviços
    NETWORK.md                ← hosts internos
    CHECKLIST.md              ← validação pós-deploy

Dockerfile                  ← frontend (raiz do repo)
backend/Dockerfile          ← API (+ base para worker)
docker-compose.yml          ← desenvolvimento local (não obrigatório em produção)
```

## Dois modos de front + API

| Modo | `VITE_PMS_API_URL` | `BACKEND_UPSTREAM` | Backend `CORS_ORIGINS` |
| --- | --- | --- | --- |
| **A — mesmo domínio** (recomendado) | = `VITE_APP_URL` | `http://<backend>:3000` | Opcional |
| **B — API pública** | `https://api.*` | Pode manter proxy ou ignorado | Definir origem do SPA |

Detalhes: [easypanel/SERVICES.md](easypanel/SERVICES.md).

## Desenvolvimento local

Inalterado:

```bash
docker compose --profile local-db -f docker-compose.yml -f docker-compose.local.yml up --build
```

Detalhes, `.env` e limitações: **[LOCAL_DOCKER.md](LOCAL_DOCKER.md)**.

Documentação legada do Compose: [../docs/DEPLOY_EASYPANEL.md](../docs/DEPLOY_EASYPANEL.md) (secção Compose).
