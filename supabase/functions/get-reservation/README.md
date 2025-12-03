# Get Reservation API

Endpoint para buscar informações de reserva por identificador, localizador ou reservation_code.

## Autenticação

Este endpoint requer autenticação. Você pode usar:
- Token de autenticação de usuário admin/user (Bearer token)
- `guest_account_id` para hóspedes autenticados

## Endpoints

### GET `/functions/v1/get-reservation`

Busca reserva usando query parameters.

**Query Parameters:**
- `identifier` (opcional): identification_number da reserva
- `locator` (opcional): reservation_code ou locator do web_checkin
- `reservation_code` (opcional): reservation_code da reserva
- `guest_account_id` (opcional): ID da conta do hóspede (para autenticação de hóspede)

**Headers:**
```
Authorization: Bearer <token>
```

**Exemplo:**
```bash
curl -X GET "https://your-project.supabase.co/functions/v1/get-reservation?locator=RSV742516" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### POST `/functions/v1/get-reservation`

Busca reserva usando body JSON.

**Request Body:**
```json
{
  "identifier": "123456", // identification_number (opcional)
  "locator": "RSV742516", // reservation_code ou locator do web_checkin (opcional)
  "reservation_code": "RSV742516", // reservation_code (opcional)
  "guest_account_id": "uuid" // Para autenticação de hóspede (opcional)
}
```

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Exemplo:**
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/get-reservation" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "locator": "RSV742516"
  }'
```

## Resposta de Sucesso

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

## Respostas de Erro

### 400 Bad Request
```json
{
  "error": "Missing identifier",
  "message": "É necessário fornecer pelo menos um dos seguintes: identifier, locator ou reservation_code"
}
```

### 401 Unauthorized
```json
{
  "error": "Missing authorization header",
  "message": "Autenticação necessária para acessar informações da reserva"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied",
  "message": "Você não tem permissão para acessar esta reserva"
}
```

### 404 Not Found
```json
{
  "error": "Reservation not found",
  "message": "Reserva não encontrada com os identificadores fornecidos"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "Erro interno ao processar a requisição"
}
```

## Segurança

- O endpoint verifica autenticação antes de retornar dados
- Para hóspedes (guest_account), verifica se a reserva está vinculada à conta do hóspede
- Apenas reservas vinculadas à conta do hóspede podem ser acessadas por hóspedes
- Usuários admin/user podem acessar qualquer reserva

## Uso no Frontend

```typescript
import { useReservationApi } from "@/hooks/useReservationApi";

function MyComponent() {
  const { getReservationByLocator, fetchReservation } = useReservationApi();
  
  // Usando query hook
  const { data, isLoading, error } = getReservationByLocator("RSV742516");
  
  // Usando mutation para busca manual
  const handleSearch = async () => {
    await fetchReservation.mutateAsync({ locator: "RSV742516" });
  };
  
  return (
    <div>
      {isLoading && <p>Carregando...</p>}
      {error && <p>Erro: {error.message}</p>}
      {data && (
        <div>
          <h2>Reserva: {data.reservation.reservation_code}</h2>
          <p>Hóspede: {data.reservation.guest?.full_name}</p>
        </div>
      )}
    </div>
  );
}
```

