# 📡 Documentação de APIs

Este documento descreve todas as APIs e endpoints disponíveis no sistema PMS.

## Índice

1. [Get Reservation API](#get-reservation-api)
2. [Email APIs](#email-apis)
3. [Stripe Integration APIs](#stripe-integration-apis)
4. [Hooks do Frontend](#hooks-do-frontend)
5. [Autenticação e Segurança](#autenticação-e-segurança)

---

## Get Reservation API

### Endpoint

```
GET/POST /functions/v1/get-reservation
```

### Descrição

Endpoint para buscar informações completas de reserva por identificador, localizador ou reservation_code. Suporta autenticação de usuários admin/user e hóspedes (guest_account).

### Autenticação

**Obrigatória**. Aceita:
- Token de usuário admin/user (Bearer token)
- `guest_account_id` para hóspedes autenticados

### Parâmetros

#### GET Request

Query parameters:
- `identifier` (opcional): identification_number da reserva
- `locator` (opcional): reservation_code ou locator do web_checkin
- `reservation_code` (opcional): reservation_code da reserva
- `guest_account_id` (opcional): ID da conta do hóspede

#### POST Request

Body JSON:
```json
{
  "identifier": "123456",
  "locator": "RSV742516",
  "reservation_code": "RSV742516",
  "guest_account_id": "uuid"
}
```

### Resposta de Sucesso

**Status:** 200 OK

```json
{
  "success": true,
  "reservation": {
    "id": "uuid",
    "reservation_code": "RSV742516",
    "identification_number": "123456",
    "checkin_date": "2024-01-15",
    "checkout_date": "2024-01-20",
    "checkin_time": "14:00",
    "checkout_time": "12:00",
    "total_amount": 1000.00,
    "paid_amount": 500.00,
    "payment_status": "partial",
    "status": "confirmed",
    "guest": {
      "id": "uuid",
      "full_name": "João Silva",
      "email": "joao@example.com",
      "phone": "+5511999999999",
      "document_number": "12345678900",
      "birth_date": "1990-01-01"
    },
    "financial_responsible": {
      "id": "uuid",
      "full_name": "João Silva",
      "email": "joao@example.com",
      "phone": "+5511999999999",
      "document_number": "12345678900"
    },
    "room": {
      "id": "uuid",
      "room_number": "101",
      "name": "Quarto 101",
      "fixed_password": "1234",
      "authentication_type": "password"
    },
    "category": {
      "id": "uuid",
      "name": "Standard",
      "capacity_adults": 2,
      "capacity_children": 1,
      "building_id": "uuid"
    },
    "establishment": {
      "id": "uuid",
      "name": "Hotel Example"
    },
    "payments": [
      {
        "id": "uuid",
        "amount": 500.00,
        "payment_date": "2024-01-10",
        "payment_method": "credit_card",
        "notes": "Pagamento parcial"
      }
    ],
    "web_checkin": {
      "id": "uuid",
      "locator": "RSV742516",
      "status": "in_progress",
      "token": "token",
      "expires_at": "2024-01-15T00:00:00Z"
    }
  }
}
```

### Respostas de Erro

#### 400 Bad Request
```json
{
  "error": "Missing identifier",
  "message": "É necessário fornecer pelo menos um dos seguintes: identifier, locator ou reservation_code"
}
```

#### 401 Unauthorized
```json
{
  "error": "Authentication required",
  "message": "Autenticação necessária. Forneça um token de usuário ou guest_account_id"
}
```

#### 403 Forbidden
```json
{
  "error": "Access denied",
  "message": "Você não tem permissão para acessar esta reserva. A reserva precisa estar vinculada à sua conta."
}
```

#### 404 Not Found
```json
{
  "error": "Reservation not found",
  "message": "Reserva não encontrada com os identificadores fornecidos"
}
```

### Exemplo de Uso

#### cURL (GET)
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/get-reservation?locator=RSV742516" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### cURL (POST)
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/get-reservation" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "locator": "RSV742516"
  }'
```

#### JavaScript/TypeScript
```typescript
import { useReservationApi } from "@/hooks/useReservationApi";

function MyComponent() {
  const { useGetReservationByLocator } = useReservationApi();
  
  const { data, isLoading, error } = useGetReservationByLocator("RSV742516");
  
  if (isLoading) return <p>Carregando...</p>;
  if (error) return <p>Erro: {error.message}</p>;
  
  return (
    <div>
      <h2>Reserva: {data?.reservation.reservation_code}</h2>
      <p>Hóspede: {data?.reservation.guest?.full_name}</p>
      <p>Status: {data?.reservation.status}</p>
    </div>
  );
}
```

### Documentação Completa

Veja [supabase/functions/get-reservation/README.md](../supabase/functions/get-reservation/README.md) para documentação detalhada.

---

## Email APIs

### Send Email SMTP

**Endpoint:** `/functions/v1/send-email-smtp`

Envio de emails via SMTP configurável.

**Documentação:** [supabase/functions/send-email-smtp/README.md](../supabase/functions/send-email-smtp/README.md)

### Send Email Resend

**Endpoint:** `/functions/v1/send-email-resend`

Envio de emails via Resend API.

**Documentação:** [GUIA_RESEND_EDGE_FUNCTION.md](../GUIA_RESEND_EDGE_FUNCTION.md)

---

## Stripe Integration APIs

### Stripe Payment

**Endpoint:** `/functions/v1/stripe-payment`

Processamento de pagamentos via Stripe.

**Documentação:** [GUIA_CONFIGURACAO_STRIPE.md](../GUIA_CONFIGURACAO_STRIPE.md)

### Stripe Webhook

**Endpoint:** `/functions/v1/stripe-webhook`

Webhooks do Stripe para eventos de pagamento.

### Stripe Payment Status

**Endpoint:** `/functions/v1/stripe-payment-status`

Verificação de status de pagamento.

### Stripe Refund

**Endpoint:** `/functions/v1/stripe-refund`

Processamento de reembolsos.

---

## Hooks do Frontend

### useReservationApi

Hook React para buscar informações de reserva usando o endpoint API.

**Localização:** `src/hooks/useReservationApi.ts`

**Métodos disponíveis:**

#### `useGetReservation(params, requireAuth)`

Busca genérica de reserva.

**Parâmetros:**
- `params`: `ReservationRequest` - Parâmetros de busca
- `requireAuth`: `boolean` - Se true, requer autenticação (padrão: true)

**Retorna:** `UseQueryResult<ReservationResponse>`

#### `useGetReservationByIdentifier(identifier, requireAuth)`

Busca reserva por identification_number.

**Parâmetros:**
- `identifier`: `string` - identification_number da reserva
- `requireAuth`: `boolean` - Se true, requer autenticação (padrão: true)

#### `useGetReservationByLocator(locator, requireAuth)`

Busca reserva por localizador (reservation_code ou locator do web_checkin).

**Parâmetros:**
- `locator`: `string` - Localizador da reserva
- `requireAuth`: `boolean` - Se true, requer autenticação (padrão: true)

#### `useGetReservationByCode(reservationCode, requireAuth)`

Busca reserva por reservation_code.

**Parâmetros:**
- `reservationCode`: `string` - reservation_code da reserva
- `requireAuth`: `boolean` - Se true, requer autenticação (padrão: true)

#### `fetchReservation`

Mutation para busca manual de reserva.

**Uso:**
```typescript
const { fetchReservation } = useReservationApi();

await fetchReservation.mutateAsync({ locator: "RSV742516" });
```

### useWebCheckin

Hook React para gerenciar o processo de web check-in.

**Localização:** `src/hooks/useWebCheckin.ts`

**Métodos disponíveis:**

- `getWebCheckinByLocator(locator, requireAuth)`: Busca web check-in por localizador
- `getWebCheckinByToken(token, requireAuth)`: Busca web check-in por token
- `startWebCheckin`: Inicia o processo de check-in
- `saveGuests`: Salva dados dos hóspedes
- `saveDocuments`: Salva documentos dos hóspedes
- `savePreferences`: Salva preferências
- `acceptTerms`: Aceita termos e políticas
- `completeWebCheckin`: Completa o check-in
- `createWebCheckin`: Cria novo web check-in
- `getPreviousCheckinData`: Busca dados de check-ins anteriores

---

## Autenticação e Segurança

### Tipos de Autenticação

#### 1. Usuários Admin/User

Autenticação via Supabase Auth com tokens JWT.

**Como obter token:**
```typescript
import { supabase } from "@/integrations/supabase/client";

const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

**Permissões:**
- Acesso a todas as reservas
- Operações administrativas
- Gerenciamento completo do sistema

#### 2. Hóspedes (Guest Accounts)

Autenticação via `guest_account_id` armazenado no localStorage.

**Como obter guest_account_id:**
```typescript
const guestAccountId = localStorage.getItem("guest_account_id");
```

**Permissões:**
- Acesso apenas a reservas vinculadas à conta (`guest_stay_history`)
- Operações limitadas ao próprio perfil
- Web check-in para suas reservas

### Controle de Acesso

#### Row Level Security (RLS)

O banco de dados utiliza RLS do Supabase para garantir:

- **Hóspedes**: Só veem suas próprias reservas
- **Usuários**: Acesso baseado em roles e estabelecimentos
- **Dados sensíveis**: Protegidos no nível do banco

#### Validação no Endpoint

O endpoint `get-reservation` valida:

1. **Autenticação**: Verifica se o usuário está autenticado
2. **Permissão**: Para hóspedes, verifica se a reserva está vinculada à conta
3. **Dados**: Retorna apenas dados autorizados

### Boas Práticas

1. **Nunca exponha Service Role Key no frontend**
2. **Use tokens JWT para autenticação de usuários**
3. **Valide permissões no backend (Edge Functions)**
4. **Use RLS no banco de dados como camada adicional de segurança**
5. **Implemente rate limiting para prevenir abuso**

---

## Changelog

### 2024-12-XX

- ✅ Adicionado endpoint `get-reservation` para busca de reservas
- ✅ Suporte a autenticação de hóspedes (guest_account)
- ✅ Hook `useReservationApi` para facilitar uso no frontend
- ✅ Documentação completa de APIs

---

## Suporte

Para dúvidas ou problemas com as APIs:

1. Consulte a documentação específica de cada endpoint
2. Verifique os logs do Supabase Edge Functions
3. Revise as políticas de RLS no banco de dados
4. Consulte os arquivos de documentação na raiz do projeto



