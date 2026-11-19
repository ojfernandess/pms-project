# Domínio personalizado — motor de reservas

## Fluxo para o cliente (tenant)

1. Em **Configurações do motor → Domínio**, salvar o hostname.
2. Configurar **CNAME** apontando para o target indicado no painel.
3. Aguardar verificação DNS/HTTPS no painel (atualiza a cada ~30s).

Com **sincronização automática** ativa no servidor, não é necessário editar manualmente o Environment do Dokploy.

## Sincronização automática (operador / Super Admin)

Variáveis no `.env` do compose (backend + worker):

| Variável | Descrição |
|----------|-----------|
| `DOKPLOY_API_URL` | URL base do Dokploy (ex. `https://dokploy.seudominio.com`) |
| `DOKPLOY_API_KEY` | API key gerada em Dokploy → Settings |
| `DOKPLOY_COMPOSE_ID` | ID do projeto Compose do PMS |
| `BOOKING_ENGINE_INFRA_AUTO_SYNC` | `true` (padrão) se as três vars acima existirem; `false` desativa |
| `DOKPLOY_DEPLOY_ON_TRAEFIK_SYNC` | `true` (padrão): dispara `compose.deploy` após alterar env |
| `BOOKING_ENGINE_CORS_FROM_DB` | `true` (padrão): API aceita `Origin` dos domínios do motor no banco |

Ao salvar domínio, o backend enfileira um job (`booking-engine-infra-sync`) que:

1. Lê todos os hostnames ativos (`companies.booking_engine_custom_domain` + `platform_custom_domains`).
2. Atualiza `BOOKING_ENGINE_TRAEFIK_RULE` e `BOOKING_ENGINE_PUBLIC_HOSTS` via `compose.saveEnvironment`.
3. Opcionalmente executa `compose.deploy`.
4. Atualiza cache CORS em memória (também refrescado a cada 5 min).

Job de reconciliação: a cada **15 minutos** (worker + BullMQ).

Ao salvar domínio, o **backend** também dispara sync **inline** (não depende só do worker). Mesmo assim, o container **worker** deve estar ativo para jobs agendados.

### Não aparece deploy no Dokploy?

1. **DOKPLOY_*** precisa estar no **backend** e no **worker** (não só no frontend).
2. Abra o compose → **Deployments** (não só Environment).
3. Na aba Domínio, após verificar, veja se surge **Erro Dokploy** (API key, composeId ou URL errados).
4. Se `BOOKING_ENGINE_TRAEFIK_RULE` já estava igual no Environment, versões antigas **não** chamavam `compose.deploy` — atualize o backend e salve o domínio de novo.
5. Confira logs: `worker` e `backend` (mensagens `Traefik motor sync` / `compose.deploy`).

Endpoints (Super Admin, JWT):

- `GET /platform-custom-domains/booking-engine/infra-status`
- `POST /platform-custom-domains/booking-engine/sync-infra`

## Modo manual (sem Dokploy API)

Se `DOKPLOY_*` não estiver configurado, a UI continua exibindo o bloco `BOOKING_ENGINE_TRAEFIK_RULE` para copiar no painel.

Script auxiliar:

```bash
node deploy/dokploy/scripts/booking-engine-traefik-rule.mjs reservas.hotel-a.com reservas.hotel-b.com
```

## Referências

- Compose: `docker-compose.dokploy.yml` (router `pms-frontend-booking`)
- Web check-in: `docs/CUSTOM_DOMAINS_WEB_CHECKIN.md`