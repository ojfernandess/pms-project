# Template One-Click Easypanel — StayOS PMS

Instalador no **mesmo padrão do [Chatwoot](https://github.com/easypanel-io/templates/tree/main/templates/chatwoot)** (`meta.yaml` + `index.ts` → JSON de serviços).

## Arquitetura gerada

| Ordem | Tipo Easypanel | Nome default | Função |
| --- | --- | --- | --- |
| 1 | `postgres` | `pms-postgres` | BD persistente (opcional se usar DB externo) |
| 2 | `redis` | `pms-redis` | Filas BullMQ + Socket.IO adapter |
| 3 | `app` | `pms-backend` | Build Git `backend/Dockerfile`, volume `/app/storage` |
| 4 | `app` | `pms-worker` | Mesma imagem, `node dist/worker.js` |
| 5 | `app` | `pms-frontend` | Build Git `Dockerfile` raiz, domínio `$(EASYPANEL_DOMAIN)` :80 |

**Rede interna (padrão Chatwoot):**

- Postgres: `$(PROJECT_NAME)_<databaseServiceName>:5432`
- Redis: `redis://default:<senha>@$(PROJECT_NAME)_<redisServiceName>:6379`
- Proxy nginx: `BACKEND_UPSTREAM=http://$(PROJECT_NAME)_<backendServiceName>:3000`

Senhas (`postgres`, `redis`, `JWT_SECRET`, tokens internos) são geradas em `generate()` — **não vão para o repositório**.

## Diagnóstico vs stack Compose atual

| Compose único | Template Easypanel |
| --- | --- |
| Uma lista de env | Env por serviço no painel |
| `backend:3000` fixo no nginx | `BACKEND_UPSTREAM` com host `$(PROJECT_NAME)_pms-backend` |
| Redeploy all-in-one | Redeploy só do front ou só do worker |

A stack `docker-compose.yml` na raiz **permanece** para desenvolvimento local; este template **não a remove**.

## Como o Chatwoot cria serviços (referência)

1. `generate(input)` devolve `{ services: [...] }`.
2. Cada entrada: `type: "app" | "postgres" | "redis"` + `data` (schema Zod em [utils/schema.ts](https://github.com/easypanel-io/templates/blob/main/utils/schema.ts)).
3. Hostnames internos: `$(PROJECT_NAME)_<serviceName>`.
4. App principal: `domains` + `$(PRIMARY_DOMAIN)`; credenciais com `randomPassword()` / `randomString()`.

Este template replica o padrão com **build GitHub + Dockerfile** (monorepo) em vez de imagem pré-publicada.

## Staging (próximo passo operacional)

Guia completo: [TESTING-STAGING.md](TESTING-STAGING.md).

## Uso A — JSON no Easypanel (validar em staging)

1. Gere o JSON (senhas novas a cada execução):

```bash
node deploy/easypanel-template/scripts/export-template-json.mjs > stayos-pms.json
```

2. Com Supabase / sem Postgres interno:

```bash
node deploy/easypanel-template/scripts/export-template-json.mjs "{\"useInternalPostgres\":false,\"prismaMigrateOnStart\":false,\"externalDatabaseUrl\":\"postgresql://USER:PASS@HOST:5432/DB\"}" > stayos-pms-external-db.json
```

3. No Easypanel: **Create project** → **Template from JSON** (ou equivalente no seu painel).
4. Revise serviços antes de aplicar. **Use projeto de teste** — não aponte produção até o [CHECKLIST](../easypanel/CHECKLIST.md).

## Uso B — Catálogo oficial easypanel-io/templates

1. Copie `deploy/easypanel-template/stayos-pms/` para `templates/stayos-pms/` no fork de [easypanel-io/templates](https://github.com/easypanel-io/templates).
2. Adicione `assets/logo.png` e `screenshot.png` (requisitos do README oficial).
3. `npm run build-templates` e `npm run dev` (playground).
4. Abra PR para o repositório oficial.

Ficheiros a editar pelo contribuidor: **apenas** `meta.yaml` e `index.ts` (não `meta.ts` gerado no upstream).

## Uso C — Instalação manual equivalente

Se o painel não tiver “template from JSON”, crie os 5 serviços à mão: [../easypanel/SERVICES.md](../easypanel/SERVICES.md).

## Migração da stack atual (sem destruir dados)

1. **Não** desinstale o Compose até validar o novo projeto.
2. Postgres interno: exporte backup; no novo serviço Postgres, **restaure** no volume — não crie volume vazio sobre dados vivos.
3. Supabase: no formulário do template, desligue Postgres interno e cole `DATABASE_URL` do pooler; `prismaMigrateOnStart=false`.
4. Copie envs sensíveis (`JWT_SECRET`, tokens) para o novo backend/worker (mesmos valores durante cutover).
5. Siga [../easypanel/MIGRATION.md](../easypanel/MIGRATION.md).

## Atualização e manutenção

| Componente | Ação |
| --- | --- |
| **Frontend** | Push no Git → rebuild serviço `pms-frontend` (mudança em `VITE_*` exige rebuild) |
| **Backend** | Push → rebuild `pms-backend`; alterar env no painel → restart só deste serviço |
| **Worker** | Rebuild ou restart; comando fixo `node dist/worker.js` |
| **Redis/Postgres** | Atualize imagem no painel com backup prévio |

## Domínio da API (webhooks)

O template expõe só o **frontend** em `$(EASYPANEL_DOMAIN)`. O browser usa proxy nginx (`/functions/v1/...`).

Para webhooks com URL dedicada (`https://api.seudominio.com`):

1. Adicione domínio no serviço **pms-backend** (porta 3000).
2. Ajuste `VITE_PMS_API_URL` no rebuild do front **ou** mantenha modo same-origin.
3. Configure `CORS_ORIGINS` no backend se usar dois domínios no browser.

## Riscos conhecidos

- **Primeiro build** do monorepo é pesado (npm ci + Vite + Nest).
- **Prisma migrate** em base Supabase cheia → manter `prismaMigrateOnStart=false`.
- **Worker bind mount** em `/app/storage` depende do caminho Easypanel; se falhar, worker continua sem ficheiros locais (maioria dos jobs usa DB/Redis).

## Ficheiros

```
deploy/easypanel-template/
  README.md
  stayos-pms/
    meta.yaml
    meta.ts          # Input (local); no upstream é gerado
    index.ts         # generate() — import ~templates-utils
  scripts/
    export-template-json.mjs
```
