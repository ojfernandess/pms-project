# Checklist de validação pós-deploy (serviços independentes)

Marque cada item após testar em produção ou staging.

## Infraestrutura

- [ ] Redis responde (backend log: `Redis connected`).
- [ ] Postgres/pooler acessível (backend log: `PostgreSQL connected`).
- [ ] `GET /health` na API retorna 200.
- [ ] Frontend health: página inicial carrega (HTTP 200).

## Backend (isolado)

- [ ] Alterar uma env no painel (ex. `PASSWORD_RESET_DEBUG`) + restart **só** do backend — sem reiniciar worker/front.
- [ ] `POST /auth/login` com credenciais válidas.
- [ ] `GET /auth/me` com Bearer token.
- [ ] `POST /rest/v1/query` (ex. `establishments`) retorna dados ou array vazio sem 401.

## Worker (isolado)

- [ ] Restart do worker **não** derruba a API.
- [ ] Logs do worker sem erro de conexão Redis/Postgres.
- [ ] Jobs BullMQ (digest/checkout) aparecem agendados ou processados (conforme env).

## Frontend (isolado)

- [ ] Rebuild do frontend **não** reinicia backend/worker.
- [ ] Login via UI.
- [ ] Navegação para `/:establishmentId/reservas` sem loading infinito.
- [ ] WebSocket: mapa/reservas em tempo real (se usado).
- [ ] Upload/storage (se aplicável).

## CORS e domínios

- [ ] Modo A: `VITE_PMS_API_URL` = URL do SPA; chamadas `/rest` e `/auth` no **mesmo** host.
- [ ] Modo B: API em `api.*`; `CORS_ORIGINS` inclui o domínio do SPA.
- [ ] Webhook Stripe: `POST /functions/v1/stripe-webhook` no domínio da API.

## Segurança

- [ ] Nenhum segredo em Dockerfile ou repositório.
- [ ] `JWT_SECRET` idêntico em backend e worker.
- [ ] Redis e Postgres **não** expostos publicamente.

## Migração Supabase → Postgres Easypanel (pré-cutover)

- [ ] Postgres Easypanel criado com volume persistente e backup configurado
- [ ] Schema aplicado no destino (migrations SQL ou dump schema-only)
- [ ] `bootstrap-target-postgres.sql` executado
- [ ] Core data restore + `verify-core-data.sql` OK
- [ ] Storage copiado para volume `/app/storage`
- [ ] `DATABASE_URL` aponta para Postgres Easypanel **apenas em staging**
- [ ] `PRISMA_MIGRATE_ON_START=false`
- [ ] Supabase produção **ainda ativa** até aprovação formal
- [ ] Plano de rollback lido: [BACKUP-RESTORE.md](BACKUP-RESTORE.md)

Documentação: [../../docs/migration/supabase-decommission-audit.md](../../docs/migration/supabase-decommission-audit.md).

## Critérios de aceitação (resumo)

- [ ] Backend implantado e configurável sozinho.
- [ ] Frontend atualizado sem reiniciar backend.
- [ ] Worker reiniciável sem parar API/front.
- [ ] Funcionalidades críticas do PMS operacionais.
