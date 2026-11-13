# Migração: Compose único → serviços independentes

## Princípios

- Não apagar volumes Postgres/Redis até validar o novo ambiente.
- Manter a stack Compose **ligada** até o checklist estar verde.
- Exportar variáveis atuais do projeto Compose antes de desligar.

## Fase 0 — inventário

1. No Easypanel, exporte/copie todas as variáveis do projeto Compose atual.
2. Anote domínios: frontend, API, webhooks Stripe/Channex, etc.
3. Confirme `DATABASE_URL` (Supabase vs Postgres interno).
4. Se usa uploads locais, identifique o volume `pms_storage` no backend.

## Fase 1 — infraestrutura base

1. Crie **Redis**; defina `REDIS_URL`.
2. Se Postgres for no Easypanel:
   - **Opção segura:** crie novo serviço Postgres, **restaure backup** da base antiga, não reutilize volume em branco sobre dados vivos.
   - **Opção volume:** anexe o volume existente ao novo serviço (só se o painel permitir e o caminho de dados for compatível).
3. Se Postgres for externo (Supabase): apenas propague `DATABASE_URL` nos novos apps.

## Fase 2 — backend e worker

1. Crie serviço **backend** com `backend/Dockerfile`.
2. Cole envs do passo 0; ajuste `REDIS_URL` para o novo host Redis.
3. Monte volume em `/app/storage` e migre ficheiros se necessário.
4. Deploy; verifique logs: `PostgreSQL connected`, `Redis connected`, `API listening on :3000`.
5. Teste `GET https://api.seudominio.com/health` (ou domínio temporário do serviço).
6. Crie **worker** com mesma imagem e `node dist/worker.js`; mesmas envs críticas.
7. Confirme nos logs do worker conexão a Redis/Bull sem erros.

## Fase 3 — frontend

1. Crie serviço **frontend** com `Dockerfile` na raiz.
2. Build args: `VITE_PMS_API_URL`, `VITE_APP_URL` conforme [SERVICES.md](SERVICES.md) (modo A ou B).
3. Runtime: `BACKEND_UPSTREAM=http://backend:3000` (nome exato do serviço API).
4. Aponte domínio `app.*` para o frontend.
5. Teste login e entrada em estabelecimento.

## Fase 4 — cutover DNS / tráfego

1. Se a API tinha domínio na stack antiga, aponte `api.*` para o **novo** serviço backend.
2. Aponte `app.*` para o **novo** frontend.
3. Webhooks: confirmar URLs em Stripe/Channex (`https://api.*/functions/v1/...`).

## Fase 5 — desligar Compose antigo

Somente após [CHECKLIST.md](CHECKLIST.md) completo:

1. Escale tráfego 100% nos novos serviços.
2. Pare o projeto Compose (não remova volumes até período de retenção acordado).
3. Documente envs finais por serviço no painel (cada um com sua aba Environment).

## Rollback

- Mantenha a stack Compose parada mas **não destruída** durante a janela de rollback.
- Reverta DNS para os domínios da stack antiga se necessário.
- `DATABASE_URL` partilhado entre old/new reduz risco de divergência de dados; evite dois backends ativos escrevendo em produção sem controle.
