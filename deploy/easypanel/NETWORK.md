# Rede interna — comunicação entre serviços (Easypanel)

No **mesmo projeto** Easypanel, os serviços resolvem uns aos outros pelo **nome do serviço** (DNS interno). Ajuste os nomes abaixo aos que você criar no painel.

| De | Para | Variável / destino | Porta |
| --- | --- | --- | --- |
| Browser | Frontend | Domínio público (ex. `https://app.seudominio.com`) | 443 → 80 |
| Browser → API (modo B) | Backend | `VITE_PMS_API_URL` → domínio `api.*` | 443 → 3000 |
| Frontend (nginx) | Backend | `BACKEND_UPSTREAM=http://<nome-backend>:3000` | 3000 |
| Backend | PostgreSQL | `DATABASE_URL` host = `<nome-postgres>` ou pooler externo | 5432 |
| Backend | Redis | `REDIS_URL=redis://<nome-redis>:6379` | 6379 |
| Worker | PostgreSQL | Igual `DATABASE_URL` do backend | 5432 |
| Worker | Redis | Igual `REDIS_URL` do backend | 6379 |
| Webhooks externos | Backend | Domínio dedicado `api.*` → serviço backend | 3000 |

## WebSocket (Socket.IO)

Com **modo A** (mesmo domínio + proxy nginx), o browser usa `wss://app.seudominio.com/socket.io/` → nginx → backend.

Com **modo B**, o cliente Nest conecta direto em `VITE_PMS_API_URL`; confirme CORS e proxy do Easypanel com suporte a `Upgrade`.

## Storage (uploads)

Backend grava em `/app/storage` por padrão. Monte um **volume persistente** no serviço backend; o worker só precisa se executar jobs que leem ficheiros do disco.

## Segredos partilhados

`JWT_SECRET`, `INTERNAL_API_TOKEN` e `SOCKET_AUTH_TOKEN` devem ser **idênticos** entre **backend** e **worker**.
