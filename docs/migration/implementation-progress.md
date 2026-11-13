# Acompanhamento da implementação — Supabase para NestJS

Este ficheiro regista o que foi **executado no código**, não o plano. Status só muda com evidência.

## Estado geral

| Etapa | Status | Evidência |
| --- | --- | --- |
| 1. Fundação do backend | Implementado | `backend/` sobe API + worker; testes unitários da fundação passam. Ligação real a Postgres/Redis só fica comprovada ao correr o Compose. |
| 2. Banco e autenticação | Em implementação | Auth de staff implementada e coberta por testes unitários. O schema Prisma continua sem as tabelas do PMS. |
| 3. Módulos de negócio | Em implementação | Leitura de empresas, estabelecimentos, quartos e reservas sobrepostas no NestJS. Criação de reservas, tarifário e check-in ainda não foram migrados. |
| 4. Edge Functions | Implementado | Bukly, API pública, FNRH, Stripe, e-mail, cobranças, tarifas, funcionários, Aiosell, Channex e `apply-dynamic-pricing-rules` respondem em `/functions/v1`. |
| 5. Realtime e storage do PMS | Implementado | Check-in, check-out, criação de reserva e gravações do cliente emitem `postgres_changes`. O health-check olha o disco do Nest. Logos relativas usam `PUBLIC_APP_URL`. |
| 6. Frontend | Implementado | O cliente em `src/integrations/supabase/client.ts` fala com o Nest (`VITE_PMS_API_URL`): sessão, consultas, RPC, storage, tempo real e funções de canal/tarifário. |
| 7. Validação de equivalência | Não iniciado | |
| 8. Desativação do Supabase | Não iniciado | |
| Deploy Easypanel | Implementado (doc) | `docs/DEPLOY_EASYPANEL.md`: web + API + worker + Redis; `VITE_PMS_API_URL` no `Dockerfile` da raiz. Sem deploy real neste ambiente. |

## Etapa 1

| Funcionalidade | Status | Ficheiros | Testes | Pendências |
| --- | --- | --- | --- | --- |
| Projeto NestJS | Implementado | `backend/src/main.ts`, `app.module.ts` | build `nest build` | — |
| Configuração de ambiente | Implementado | `backend/src/config/env.validation.ts`, `backend/.env.example` | `env.validation.spec.ts` | — |
| Erros HTTP globais | Implementado | `backend/src/common/filters/all-exceptions.filter.ts` | `all-exceptions.filter.spec.ts` | — |
| Prisma + Postgres | Implementado (ligação) | `backend/src/prisma/*`, `backend/prisma/schema.prisma` | ping coberto em `health.service.spec.ts` (mock) | Schema limitado a `backend_healthchecks`. O modelo do PMS exige `prisma db pull` sobre uma cópia do banco real. |
| Redis | Implementado | `backend/src/redis/*` | ping coberto no health (mock) | — |
| BullMQ | Implementado (fila `system`) | `backend/src/queues/*`, `backend/src/worker.ts` | `system.processor.spec.ts` | Sem filas de negócio (reservas, Bukly, pagamentos). |
| Socket.IO + Redis adapter | Implementado (transporte) | `backend/src/realtime/*` | `realtime.gateway.spec.ts` | Sem eventos de reservas, mapa ou notificações. |
| Docker Compose | Implementado | `docker-compose.yml`, `backend/Dockerfile` | não executado neste ambiente se o Docker não estiver disponível | Credenciais `pms`/`pms` são só de desenvolvimento local. |

## Etapa 2

| Funcionalidade | Status | Evidência | Pendências |
| --- | --- | --- | --- |
| Senhas existentes | Implementado | Login compara `auth.users.encrypted_password` com bcrypt e não grava nada no sucesso. Teste em `auth.service.spec.ts`. | Sem prova contra a base real. O `.env` só tem a API do Supabase, não a connection string do Postgres. |
| Login, refresh, logout, reset | Implementado | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`, `GET /auth/me` | O e-mail de reset ainda não é enviado. Sem `PASSWORD_RESET_DEBUG=true` o token não sai na resposta. |
| Isolamento empresa/estabelecimento | Testado | `canAccessEstablishment` replica `public.user_can_access_establishment` de `20251219000005_fix_employees_rls_recursion_final.sql`: super admin ou `user_companies`. | Funcionário só em `employees` continua sem acesso, como na função SQL atual. Não foi alterado. |
| Schema Prisma do PMS | Implementado | `prisma db pull` em 6 de novembro de 2026: 140 models de `public`, `auth`, `storage` e `extensions` em `backend/prisma/schema.prisma`. | Prisma não representa RLS, checks nem índices por expressão. `users` ficou `auth_users` e `public_users`. As tabelas `backend_*` foram recolocadas no schema porque ainda não existem na base. Não foi corrido `migrate`. |

## Etapa 3

| Funcionalidade | Status | Evidência | Pendências |
| --- | --- | --- | --- |
| Empresas e estabelecimentos | Testado | `GET /companies`, `GET /companies/:id`, `GET /companies/:id/establishments`, `GET /establishments/:id`. O teste recusa a empresa alheia antes de consultar. | Sem prova contra a base real. |
| Quartos | Testado | `GET /establishments/:id/rooms`. O select não inclui `fixed_password`. | Sem prova contra a base real. |
| Reservas no período | Testado | `GET /establishments/:id/reservations?from&to`. Mesmo recorte do mapa: sobreposição de datas e exclusão de `cancelled`. | Alteração geral da reserva ainda não foi migrada. |
| Criar reserva, tarifa, check-in e check-out | Implementado | `POST /reservations/lock` chama `create_reservation_with_lock`. `POST /rates/quote` chama `calculate_rate_price`. Check-in e check-out gravam no Postgres. O React desses fluxos usa `VITE_PMS_API_URL`. | A atualização no Channex depois da troca de categoria passa por `channex-booking-crs-update` no Nest. |

## Etapa 4

| Função | Status | Notas |
| --- | --- | --- |
| `health-check` | Testado | Database via `establishments`; storage via `storage.buckets`. Storage em falha deixa o estado `degraded`, como a função original. |
| `robots` | Testado | Mesmo texto padrão e a mesma escolha por domínio ou slug. |
| `get-site-settings` | Implementado | Lê `site_settings` no id fixo da função original. |
| `get-reservation` | Testado | Identificador, código, locator, hóspede vinculado e JWT do Nest. Token antigo do Supabase deixa de ser aceite. |
| `process-no-shows` | Implementado | Chama `public.process_no_shows` e devolve o mesmo JSON da função original. |
| `sitemap` | Implementado | XML com o mesmo `site_settings` e as mesmas URLs de empresa ou catálogo global. |
| `rates-dashboard` | Implementado | Categorias, planos, tipos e `rate_system_settings` do estabelecimento. Exige utilizador staff. |
| `call-company-webhook` | Implementado | Assina o corpo com HMAC-SHA256 e usa `booking_engine_webhook_secret` só no envio. |
| `stripe-payment`, `stripe-payment-status`, `stripe-refund` | Implementado | Chamam a API Stripe 2023-10-16 com a chave do estabelecimento. |
| `send-email-resend`, `send-email-sendgrid`, `send-email-smtp` | Implementado | Mesmos campos, CC/BCC e mensagens de erro. SMTP usa Nodemailer. |
| `recalc-rates`, `rates-map`, `render-html`, `list-channel-templates` | Implementado | Recálculo grava `dynamic_pricing_results`. O mapa usa o Redis do Nest com TTL de 15 minutos. |
| `apply-dynamic-pricing-rules` | Implementado | Prévia de preço com `calculate_rate_price`, métricas de ocupação/pickup/evento e regras que bateram. Não havia fonte Deno no repositório. |
| `send-daily-digest`, `send-daily-digest-schedule` | Implementado | O agendamento chama o envio no próprio processo, sem voltar ao Supabase. |
| `create-employee-auth`, `employee-auth-admin` | Implementado | Cria `auth.users` com bcrypt e lê o estado em `auth.users`. O e-mail Confirm sign up não é enviado: `auth_email_sent` fica falso e o reenvio responde 400. |
| `bukly-sync` | Implementado | Envia OTA XML de tarifa e disponibilidade para o Bukly com as credenciais de `ota_channels`. |
| `company-public-api` | Implementado | Mesmas ações e a mesma autenticação por ClientId/ClientSecret. |
| `fnrh-submit`, `fnrh-lifecycle` | Implementado | Registrar, checkout, cancelar e no-show na API v2 da FNRH. A equipe entra pelo acesso ao estabelecimento; o hóspede entra pelo token do web check-in. |
| `stripe-webhook` | Implementado | Confere a assinatura e trata pagamento confirmado, falha, reembolso e método anexado. O corpo cru chega com `rawBody`. |
| `send-checkin-charge`, `send-checkin-charge-schedule`, `send-checkout-reminders` | Implementado | A cobrança envia pelos canais configurados. O agendamento escolhe as reservas e chama essa cobrança. O lembrete grava a fila e envia pelo provedor ativo. |
| `aiosell-sync`, `aiosell-reservations-sync`, `aiosell-reservation-webhook` | Implementado | Tarifas, inventário, webhook e pull usam Prisma e a API Aiosell. O webhook dispara `AiosellSyncService` no processo. Sem chamada real à Aiosell. |
| `channex-sync`, `channex-reservations-sync`, `channex-reservation-webhook`, `channex-ack-worker`, `channex-booking-crs-update`, `channex-mapping-options` | Implementado | ARI, revisões, ACK, atualização CRS e opções de mapeamento. O webhook confere `user-api-key` quando o canal exige. Sem chamada real ao Channex. |

## O que isto ainda não faz

- As telas deixam de chamar `supabase.co`. A sessão fica no Redis e só aceita o JWT do Nest. As consultas correm com o papel `authenticated` ou `anon`. Ficheiros novos e o health-check de storage usam `backend/storage`.
- O Postgres continua a ser o que estiver em `DATABASE_URL`. Se essa URL ainda for o pooler do Supabase, os dados continuam nesse servidor até um restauro noutro Postgres. Não foi feito dump nem `migrate`.
- Aiosell e Channex respondem no Nest. Não houve chamada real a esses canais. O worker agenda o resumo do dia e o lembrete de checkout. A migração `20261107090000_unschedule_supabase_edge_crons.sql` remove os crons antigos e não foi executada na base.
- Não migra dados.
- Não marca nenhuma funcionalidade de negócio como validada.
