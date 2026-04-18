# Bukly Channel Manager - Webhooks

Este documento descreve como configurar e processar webhooks do Bukly Channel Manager.

## Endpoints de Webhook

O Bukly envia webhooks para os seguintes endpoints:

### 1. Nova Reserva (Booking)
```
POST /api/webhooks/bukly/booking
```

### 2. Modificação de Reserva (Modification)
```
POST /api/webhooks/bukly/modification
```

### 3. Cancelamento de Reserva (Cancellation)
```
POST /api/webhooks/bukly/cancellation
```

## Configuração no Bukly

1. Acesse o painel do Bukly
2. Vá em Configurações > Webhooks
3. Configure os seguintes URLs:
   - **Nova Reserva**: `https://seu-dominio.com/api/webhooks/bukly/booking`
   - **Modificação**: `https://seu-dominio.com/api/webhooks/bukly/modification`
   - **Cancelamento**: `https://seu-dominio.com/api/webhooks/bukly/cancellation`
4. Configure o **Webhook Secret** (mesmo valor configurado no PMS)

## Estrutura dos Webhooks

### Booking (Nova Reserva)
```json
{
  "event": "booking",
  "timestamp": "2025-01-20T10:30:00Z",
  "data": {
    "booking_id": "BUKLY-12345",
    "ota_channel": "booking.com",
    "hotel_id": "hotel-123",
    "guest": {
      "name": "João Silva",
      "email": "joao@example.com",
      "phone": "+5511999999999",
      "document": "12345678900"
    },
    "reservation": {
      "checkin_date": "2025-02-01",
      "checkout_date": "2025-02-05",
      "adults": 2,
      "children": 1,
      "category_id": "cat-123",
      "room_id": "room-456",
      "total_amount": 1200.00,
      "currency": "BRL"
    }
  }
}
```

### Modification (Modificação)
```json
{
  "event": "modification",
  "timestamp": "2025-01-20T10:30:00Z",
  "data": {
    "booking_id": "BUKLY-12345",
    "changes": {
      "checkin_date": "2025-02-02",
      "checkout_date": "2025-02-06",
      "adults": 3
    }
  }
}
```

### Cancellation (Cancelamento)
```json
{
  "event": "cancellation",
  "timestamp": "2025-01-20T10:30:00Z",
  "data": {
    "booking_id": "BUKLY-12345",
    "reason": "Guest request",
    "refund_amount": 1200.00
  }
}
```

## Implementação

Os webhooks são processados automaticamente pelo hook `useBuklyIntegration` e salvos na tabela `bukly_webhooks` para processamento assíncrono.

### Processamento Automático

1. Webhook recebido → Salvo em `bukly_webhooks`
2. Processamento assíncrono:
   - **Booking**: Cria nova reserva no PMS
   - **Modification**: Atualiza reserva existente
   - **Cancellation**: Cancela reserva existente
3. Webhook marcado como `processed: true`

### Validação de Segurança

Todos os webhooks devem incluir um header de autenticação:
```
X-Webhook-Secret: <webhook_secret_configurado>
```

O sistema valida este secret antes de processar o webhook.

## Logs e Monitoramento

- Todos os webhooks são salvos em `bukly_webhooks`
- Logs de sincronização em `bukly_sync_logs`
- Status de processamento visível no Channel Manager

## Troubleshooting

### Webhook não está sendo processado
1. Verifique se o webhook foi recebido (tabela `bukly_webhooks`)
2. Verifique o campo `error_message` para detalhes do erro
3. Verifique se o `webhook_secret` está correto

### Reserva não foi criada
1. Verifique os logs em `bukly_webhooks`
2. Verifique se todos os campos obrigatórios estão presentes
3. Verifique se a categoria/quartos existem no PMS

