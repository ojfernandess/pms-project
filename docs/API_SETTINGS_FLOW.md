# Fluxo de Funcionamento das Configurações de API

## 📊 Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────┐
│                    CONFIGURAÇÃO INICIAL                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  Usuário acessa:                      │
        │  Configurações > Integrações          │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  Cria/Edita Configuração de API:      │
        │  • Nome da API (booking_engine, etc) │
        │  • URL da API                         │
        │  • API Key                            │
        │  • API Secret                         │
        │  • Config JSON (opcional)             │
        │  • Status (Ativo/Inativo)            │
        └───────────────────────────────────────┘
                            │
                            ▼
        ┌───────────────────────────────────────┐
        │  Salva no Banco:                      │
        │  Tabela: api_settings                  │
        │  • establishment_id (multi-tenant)    │
        │  • api_name (único por estabelecimento)│
        │  • Credenciais criptografadas         │
        └───────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    USO NO SISTEMA                            │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌───────────────────┐              ┌───────────────────┐
│  NO FRONTEND      │              │  NO BACKEND       │
│  (React)          │              │  (Edge Functions) │
└───────────────────┘              └───────────────────┘
        │                                       │
        ▼                                       ▼
┌───────────────────┐              ┌───────────────────┐
│ useApiSettings()  │              │ getApiConfig()    │
│ hook              │              │ função            │
└───────────────────┘              └───────────────────┘
        │                                       │
        ▼                                       ▼
┌───────────────────┐              ┌───────────────────┐
│ Busca configuração│              │ Busca configuração│
│ do estabelecimento│              │ do estabelecimento│
└───────────────────┘              └───────────────────┘
        │                                       │
        ▼                                       ▼
┌───────────────────┐              ┌───────────────────┐
│ apiRequest()      │              │ fetch() com       │
│ ou                │              │ credenciais       │
│ useApiConfig()    │              │ da configuração   │
└───────────────────┘              └───────────────────┘
        │                                       │
        └───────────────┬───────────────────────┘
                        ▼
        ┌───────────────────────────────────────┐
        │  Faz Requisição HTTP:                 │
        │  • URL: config.api_url + endpoint     │
        │  • Headers: Authorization, etc        │
        │  • Body: dados da requisição          │
        └───────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────────────┐
        │  Processa Resposta:                   │
        │  • Sincroniza dados                   │
        │  • Atualiza banco local               │
        │  • Loga erros se houver               │
        └───────────────────────────────────────┘
```

## 🔄 Exemplo Prático: Sincronização com Booking Engine

### 1. Configuração (Uma vez)

```
Usuário → Configurações → Integrações
  → Nova Configuração
  → Nome: "Booking Engine"
  → URL: "https://api.bookingengine.com"
  → API Key: "sk_live_abc123..."
  → API Secret: "secret_xyz789..."
  → Ativo: ✓
  → Salvar
```

### 2. Uso no Código

```typescript
// Em qualquer componente ou função
import { apiRequest } from "@/lib/apiClient";

// Sincronizar reservas
async function syncReservations() {
  try {
    // Busca automaticamente a configuração "booking_engine"
    const reservations = await apiRequest(
      "booking_engine",
      "/reservations",
      {
        method: "GET",
      }
    );
    
    // Processa e salva no banco
    for (const reservation of reservations) {
      await saveReservation(reservation);
    }
  } catch (error) {
    // Erro já é logado automaticamente
    toast.error("Erro ao sincronizar reservas");
  }
}
```

### 3. Fluxo Automático (Opcional)

```typescript
// Edge Function que roda periodicamente
// supabase/functions/sync-booking-engine/index.ts

serve(async (req) => {
  // Buscar todas as configurações ativas de booking_engine
  const { data: configs } = await supabase
    .from("api_settings")
    .select("*")
    .eq("api_name", "booking_engine")
    .eq("is_active", true);
  
  for (const config of configs) {
    // Sincronizar para cada estabelecimento
    await syncEstablishment(config);
  }
});
```

## 🎯 Casos de Uso Reais

### Caso 1: Sincronização de Preços

```typescript
// Quando preço é alterado no sistema
async function updatePrice(roomId: string, price: number) {
  // Salva no banco local
  await savePrice(roomId, price);
  
  // Sincroniza com Channel Manager se configurado
  try {
    await apiRequest("channel_manager", "/prices", {
      method: "POST",
      body: JSON.stringify({ room_id: roomId, price }),
    });
  } catch (error) {
    // Loga erro mas não bloqueia a operação
    console.error("Erro ao sincronizar preço:", error);
  }
}
```

### Caso 2: Webhook de Reserva

```typescript
// Edge Function que recebe webhook
serve(async (req) => {
  const webhookData = await req.json();
  
  // Buscar configuração para validar webhook
  const config = await getApiConfig("booking_engine");
  
  if (!config) {
    return new Response("API não configurada", { status: 400 });
  }
  
  // Validar assinatura do webhook usando api_secret
  const isValid = validateWebhook(webhookData, config.api_secret);
  
  if (!isValid) {
    return new Response("Assinatura inválida", { status: 401 });
  }
  
  // Processar webhook
  await processReservation(webhookData);
});
```

### Caso 3: Verificação de Disponibilidade

```typescript
// Antes de criar reserva, verificar disponibilidade na API externa
async function checkExternalAvailability(roomId: string, dates: { checkin: string, checkout: string }) {
  const config = await getApiConfig("booking_engine");
  
  if (!config?.is_active) {
    // Se não configurado, permitir reserva (modo offline)
    return { available: true };
  }
  
  // Verificar na API externa
  const availability = await apiRequest("booking_engine", "/availability", {
    method: "POST",
    body: JSON.stringify({ room_id: roomId, ...dates }),
  });
  
  return availability;
}
```

## 🔐 Segurança

### Armazenamento
- ✅ Credenciais armazenadas no banco com RLS (Row Level Security)
- ✅ Apenas usuários do estabelecimento podem ver suas configurações
- ✅ API Secret nunca exposto no frontend

### Uso
- ✅ Frontend: Apenas leitura de configurações (sem secrets)
- ✅ Backend: Uso completo de credenciais em Edge Functions
- ✅ Validação de configuração antes de usar

## 📈 Benefícios

1. **Centralização**: Todas as configurações em um só lugar
2. **Multi-tenant**: Cada estabelecimento tem suas próprias configurações
3. **Flexibilidade**: Config JSON permite personalização por API
4. **Segurança**: Credenciais protegidas por RLS
5. **Facilidade**: Funções utilitárias simplificam o uso
6. **Observabilidade**: Erros são logados automaticamente

## 🚀 Próximos Passos para Implementar

1. **Identificar APIs que precisam ser integradas**
2. **Criar hooks específicos** (ex: `useBookingEngine`, `useChannelManager`)
3. **Implementar funções de sincronização**
4. **Adicionar sincronização automática** (cron jobs)
5. **Criar interface de monitoramento** de sincronizações



