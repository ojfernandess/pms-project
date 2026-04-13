# PMS API (minimal)

Node **20** + **Fastify** + **TypeScript**. Supabase como **Postgres + Auth**: **service role** no servidor; **anon key** só para validar o JWT nas rotas protegidas.

## Estrutura

```text
src/
├── index.ts           # arranque
├── server.ts          # Fastify + plugins
├── config/env.ts      # Zod (env)
├── routes/            # rotas HTTP
├── services/          # Supabase + Stripe
├── middleware/        # auth + errors
└── utils/
```

## Rotas

| Método | Caminho | Auth |
|--------|---------|------|
| GET | `/health` | não |
| POST | `/api/reservas` | Bearer JWT |
| GET | `/api/disponibilidade` | Bearer JWT |
| POST | `/api/checkin` | Bearer JWT |
| POST | `/api/checkin-charge/templates` | Bearer JWT |
| POST | `/api/checkin-charge/send` | Bearer JWT |
| POST | `/api/pagamentos/stripe/intent` | não (fluxo público) |
| POST | `/api/pagamentos/stripe/status` | não (fluxo público) |
| POST | `/api/pagamentos/stripe/refund` | app autenticada |
| POST | `/api/webhooks/stripe` | `Stripe-Signature` (corpo bruto) |
| POST | `/api/webhooks/aiosell-reservation` | webhook externo (sem JWT; segredo no header/query/body) |
| POST | `/api/webhooks/channex-reservation` | webhook externo (sem JWT; repasse de `user-api-key`/headers) |

---

## Passo a passo

### 1. Clonar variáveis de ambiente

Na pasta `server/`:

```bash
cp .env.example .env
```

Preencher no `.env`:

- `SUPABASE_URL` — URL do projeto (Settings → API).
- `SUPABASE_SERVICE_ROLE_KEY` — **só no servidor**; nunca no browser.
- `SUPABASE_ANON_KEY` — usada só para `auth.getUser(jwt)` no middleware.
- `PORT` — ex.: `8787` (local) ou o que o EasyPanel injetar.
- `CORS_ORIGIN` — origem do teu front (ex.: `https://app.teudominio.com`); em dev podes usar `http://localhost:5173`.
- Stripe por estabelecimento: preencher `stripe_establishment_config` (`test_secret_key`/`live_secret_key` e `webhook_secret_test`/`webhook_secret_live`).
- Stripe global: `stripe_global_config.test_mode` define se o backend usa chaves `test_*` ou `live_*`.

### 2. Instalar e correr em desenvolvimento

```bash
cd server
npm install
npm run dev
```

Confirmar: abrir `http://localhost:8787/health` (ajusta a porta se mudaste o `PORT`).

### 3. Correr em produção (Node)

```bash
npm run build
npm start
```

O processo escuta em `0.0.0.0` na porta definida por `PORT`.

### 4. Docker / EasyPanel

Na raiz da pasta `server` (onde está o `Dockerfile`):

```bash
docker build -t pms-api .
docker run -p 8787:8787 --env-file .env pms-api
```

No EasyPanel: criar app a partir do repositório, definir **build context** na pasta `server`, mapear as mesmas variáveis do `.env.example`, e expor a porta HTTP. O healthcheck do `Dockerfile` usa `GET /health`.

### 5. Autenticação nas rotas `/api/*` (exceto webhook)

O cliente deve enviar o access token do utilizador Supabase:

```http
Authorization: Bearer <access_token>
```

O servidor valida o token com a anon key e associa `request.user.id` ao campo `created_by` na criação de reservas (equivalente ao `user?.id` no `useReservations`).

### 6. Alinhar o frontend a esta API (reservas)

Hoje o PMS cria reservas no browser com `supabase.rpc("create_reservation_with_lock", …)` em `src/hooks/useReservations.ts`. O corpo de **`POST /api/reservas`** foi alinhado a esse fluxo: aceita os mesmos campos lógicos e devolve `{ ok: true, reservation }` com um objeto no mesmo estilo da query pós-RPC (joins `financial_responsible`, `guest`, `rooms`, `room_categories`).

**Regras de validação HTTP (Zod):**

- Obrigatórios: `establishment_id`, `checkin_date`, `checkout_date` (datas `YYYY-MM-DD`).
- É obrigatório enviar pelo menos um de: `room_id` ou `category_id` (pode ser `null` o outro, mas não ambos ausentes).
- `created_by` **não** vai no JSON do cliente: o servidor preenche com o utilizador do JWT.

**Exemplo de corpo (pré-reserva por categoria, espelhando o hook):**

```json
{
  "establishment_id": "00000000-0000-0000-0000-000000000001",
  "checkin_date": "2026-05-01",
  "checkout_date": "2026-05-03",
  "category_id": "00000000-0000-0000-0000-000000000002",
  "room_id": null,
  "guest_id": null,
  "client_id": "00000000-0000-0000-0000-000000000003",
  "financial_responsible_id": null,
  "guest_name": "Maria Silva",
  "adults": 2,
  "children": 0,
  "total_amount": 450,
  "paid_amount": 0,
  "payment_status": "pending",
  "status": "pending",
  "notes": null,
  "checkin_time": null,
  "checkout_time": null,
  "pricing_plan_id": "00000000-0000-0000-0000-000000000004",
  "expiration_date": null,
  "channel": "direct",
  "coupon_id": null
}
```

**Exemplo de chamada a partir do frontend (substituindo o RPC):**

```ts
const apiBase = import.meta.env.VITE_PMS_API_URL; // ex.: https://api.teudominio.com
const { data: { session } } = await supabase.auth.getSession();
const res = await fetch(`${apiBase}/api/reservas`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token}`,
  },
  body: JSON.stringify({
    establishment_id: establishmentId,
    checkin_date: reservation.checkin_date,
    checkout_date: reservation.checkout_date,
    room_id: reservation.room_id ?? null,
    category_id: reservation.category_id ?? null,
    guest_id: reservation.guest_id ?? null,
    client_id: reservation.client_id ?? null,
    financial_responsible_id: reservation.financial_responsible_id ?? null,
    guest_name: reservation.guest_name ?? null,
    adults: reservation.adults ?? 1,
    children: reservation.children ?? 0,
    total_amount: reservation.total_amount ?? 0,
    paid_amount: reservation.paid_amount ?? 0,
    payment_status: reservation.payment_status ?? "pending",
    status: reservation.status ?? "pending",
    notes: reservation.notes ?? null,
    checkin_time: reservation.checkin_time ?? null,
    checkout_time: reservation.checkout_time ?? null,
    pricing_plan_id: reservation.pricing_plan_id ?? null,
    expiration_date: reservation.expiration_date ?? null,
    channel: reservation.channel ?? "direct",
    coupon_id: (reservation as { coupon_id?: string }).coupon_id ?? null,
  }),
});
const json = await res.json();
if (!res.ok) throw new Error(json?.error || "Erro ao criar reserva");
// json.reservation — usar como hoje `newReservation` após o RPC
```

Define `VITE_PMS_API_URL` no `.env` do frontend (sem barra final).

**Disponibilidade:** o mapa de reservas continua a validar disponibilidade no cliente (`validateRoomAvailability` / `validateCategoryAvailability`) antes de gravar. Se mudares para esta API, mantém essa validação no front **ou** implementa a mesma regra no servidor antes do RPC.

### 7. Webhook Stripe

Configura no Stripe Dashboard o endpoint `https://<teu-api>/api/webhooks/stripe` (ou `?establishment_id=<uuid>` para roteamento explícito). O backend resolve as chaves do estabelecimento via `stripe_establishment_config`, respeitando `stripe_global_config.test_mode`, e valida a assinatura com o `webhook_secret` correto. O corpo chega **bruto** (raw) e já é tratado pelo parser em buffer.

### 8. Webhook Aiosell (reservas)

Configura no painel da Aiosell o endpoint `https://<teu-api>/api/webhooks/aiosell-reservation`.

Para autenticação do webhook, mantém a mesma estratégia já usada no legado (`x-aiosell-secret`, `x-webhook-secret`, `x-api-secret`, `Authorization Basic/Bearer`, ou `?secret=`). O backend Node apenas encaminha request/query para a função legada `aiosell-reservation-webhook`, então o comportamento de validação continua igual.

### 9. Webhook Channex (reservas)

Configura no Channex o endpoint `https://<teu-api>/api/webhooks/channex-reservation`.

O backend Node encaminha request/query para a função legada `channex-reservation-webhook`, preservando a validação existente (incluindo `user-api-key` quando habilitado no canal).

#### Teste rápido (curl)

Use este teste para validar que o endpoint está respondendo e que o repasse de header funciona:

```bash
curl -X POST "http://localhost:8787/api/webhooks/channex-reservation" \
  -H "Content-Type: application/json" \
  -H "user-api-key: SEU_USER_API_KEY_DO_CHANNEX" \
  -d '{
    "event": "booking:new",
    "property_id": "UUID_DA_PROPERTY_NO_CHANNEX",
    "booking_id": "booking-test-001",
    "booking_revision_id": "rev-test-001"
  }'
```

Se seu fluxo exigir query params (ex.: por configuração de canal), teste também:

```bash
curl -X POST "http://localhost:8787/api/webhooks/channex-reservation?property_id=UUID_DA_PROPERTY_NO_CHANNEX" \
  -H "Content-Type: application/json" \
  -H "user-api-key: SEU_USER_API_KEY_DO_CHANNEX" \
  -d '{"event":"booking:update"}'
```

Resultado esperado:
- Status HTTP `2xx` quando canal/configuração batem.
- Status `401/404` quando credenciais/property_id não conferem (comportamento legado preservado).

### 10. O que não está neste servidor

- Não há rota de compatibilidade `/functions/v1/:nome`.
- Funções que o proxy listava em `src/integrations/supabase/nodeFunctionsScope.ts` continuam a ser Edge Functions ou terão de ganhar **rotas novas explícitas** neste projeto (ex.: futuro `POST /api/pagamentos/stripe/intent` para substituir `stripe-payment` usado em `CheckinChargePaymentPage.tsx`).

### 11. Expandir o projeto

1. Nova lógica em `src/services/<nome>.ts`.
2. Registar rota em `src/routes/index.ts` (ou plugin em `src/routes/<nome>.ts` importado no `registerRoutes`).

---

## Resposta de erro

Erros mapeados pelo handler devolvem JSON com `statusCode`, `code` e `message` (e detalhes de validação quando aplicável).
