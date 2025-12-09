# Como Usar Configurações de API no Sistema

Este documento explica como as configurações de API funcionam e como utilizá-las no sistema.

## 📋 Visão Geral

As configurações de API permitem que o sistema armazene credenciais e configurações para integrações com serviços externos, como:
- Booking Engines
- Channel Managers
- Payment Gateways
- Outras APIs personalizadas

## 🗄️ Estrutura de Dados

### Tabela `api_settings`

```sql
CREATE TABLE api_settings (
  id UUID PRIMARY KEY,
  establishment_id UUID REFERENCES establishments(id),
  api_name TEXT NOT NULL UNIQUE,  -- 'booking_engine', 'amplifique', 'channel_manager', etc.
  api_key TEXT,                   -- Chave de API
  api_secret TEXT,                -- Segredo de API (criptografado)
  api_url TEXT,                   -- URL base da API
  is_active BOOLEAN DEFAULT true, -- Se a integração está ativa
  config JSONB,                   -- Configurações adicionais em JSON
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## 🔧 Como Usar no Código

### 1. Buscar Configurações de API

```typescript
import { useApiSettings } from "@/hooks/useApiSettings";

function MyComponent() {
  const { apiSettings, isLoading } = useApiSettings();
  
  // Buscar configuração específica
  const bookingEngineConfig = apiSettings.find(
    (setting) => setting.api_name === "booking_engine"
  );
  
  if (bookingEngineConfig?.is_active) {
    // Usar a configuração
    const apiKey = bookingEngineConfig.api_key;
    const apiUrl = bookingEngineConfig.api_url;
    // ...
  }
}
```

### 2. Criar um Hook Personalizado para uma API Específica

```typescript
// src/hooks/useBookingEngine.ts
import { useApiSettings } from "@/hooks/useApiSettings";
import { useMemo } from "react";

export const useBookingEngine = () => {
  const { apiSettings } = useApiSettings();
  
  const config = useMemo(() => {
    return apiSettings.find(
      (setting) => setting.api_name === "booking_engine" && setting.is_active
    );
  }, [apiSettings]);
  
  const isConfigured = !!config;
  
  const makeRequest = async (endpoint: string, options: RequestInit = {}) => {
    if (!config) {
      throw new Error("Booking Engine não está configurado");
    }
    
    const url = `${config.api_url}${endpoint}`;
    const headers = {
      "Authorization": `Bearer ${config.api_key}`,
      "Content-Type": "application/json",
      ...options.headers,
    };
    
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    
    return response.json();
  };
  
  return {
    config,
    isConfigured,
    makeRequest,
  };
};
```

### 3. Usar em Edge Functions

```typescript
// supabase/functions/booking-engine-sync/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  
  // Buscar configuração de API
  const { data: apiConfig, error } = await supabase
    .from("api_settings")
    .select("*")
    .eq("api_name", "booking_engine")
    .eq("is_active", true)
    .eq("establishment_id", req.headers.get("establishment-id"))
    .single();
  
  if (error || !apiConfig) {
    return new Response(
      JSON.stringify({ error: "API não configurada" }),
      { status: 400 }
    );
  }
  
  // Usar configuração para fazer requisição
  const response = await fetch(`${apiConfig.api_url}/reservations`, {
    headers: {
      "Authorization": `Bearer ${apiConfig.api_key}`,
      "Content-Type": "application/json",
    },
    method: "GET",
  });
  
  const data = await response.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
```

## 📝 Exemplos de Uso

### Exemplo 1: Sincronizar Reservas com Booking Engine

```typescript
// src/lib/bookingEngineSync.ts
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

export async function syncReservationsWithBookingEngine() {
  const establishmentId = getSelectedEstablishmentId();
  
  // Buscar configuração
  const { data: config } = await supabase
    .from("api_settings")
    .select("*")
    .eq("api_name", "booking_engine")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .single();
  
  if (!config) {
    throw new Error("Booking Engine não está configurado");
  }
  
  // Fazer requisição para a API
  const response = await fetch(`${config.api_url}/reservations`, {
    headers: {
      "Authorization": `Bearer ${config.api_key}`,
      "Content-Type": "application/json",
    },
  });
  
  const reservations = await response.json();
  
  // Processar e salvar no banco
  // ...
}
```

### Exemplo 2: Enviar Preços para Channel Manager

```typescript
// src/lib/channelManagerSync.ts
export async function syncPricesToChannelManager(
  roomId: string,
  prices: { date: string; price: number }[]
) {
  const establishmentId = getSelectedEstablishmentId();
  
  const { data: config } = await supabase
    .from("api_settings")
    .select("*")
    .eq("api_name", "channel_manager")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .single();
  
  if (!config) {
    throw new Error("Channel Manager não está configurado");
  }
  
  // Usar configurações adicionais do JSON config
  const timeout = config.config?.timeout || 5000;
  const retry = config.config?.retry || 3;
  
  const response = await fetch(`${config.api_url}/prices`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.api_key}`,
      "X-API-Secret": config.api_secret || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      room_id: roomId,
      prices,
    }),
  });
  
  return response.json();
}
```

### Exemplo 3: Processar Pagamento via Payment Gateway

```typescript
// src/lib/paymentGateway.ts
export async function processPayment(
  amount: number,
  paymentMethod: string
) {
  const establishmentId = getSelectedEstablishmentId();
  
  const { data: config } = await supabase
    .from("api_settings")
    .select("*")
    .eq("api_name", "payment_gateway")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .single();
  
  if (!config) {
    throw new Error("Payment Gateway não está configurado");
  }
  
  // Configurações específicas do gateway podem estar em config.config
  const gatewayConfig = config.config || {};
  
  const response = await fetch(`${config.api_url}/payments`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      payment_method: paymentMethod,
      ...gatewayConfig, // Configurações adicionais
    }),
  });
  
  return response.json();
}
```

## 🔐 Segurança

### Boas Práticas

1. **Nunca exponha secrets no frontend**
   - Use Edge Functions para requisições que precisam de secrets
   - Secrets devem ser usados apenas no backend

2. **Validação de Configuração**
   ```typescript
   function validateApiConfig(config: any) {
     if (!config?.api_key) {
       throw new Error("API Key não configurada");
     }
     if (!config?.api_url) {
       throw new Error("API URL não configurada");
     }
     return true;
   }
   ```

3. **Tratamento de Erros**
   ```typescript
   try {
     await syncWithAPI();
   } catch (error) {
     if (error.message.includes("não configurado")) {
       toast.error("Configure a API nas Configurações > Integrações");
     } else {
       toast.error("Erro ao sincronizar com API");
     }
   }
   ```

## 🔄 Fluxo de Integração

### 1. Configuração Inicial
```
Usuário → Configurações → Integrações → Nova Configuração
  → Preenche: Nome, URL, API Key, API Secret
  → Salva no banco (api_settings)
```

### 2. Uso no Sistema
```
Componente/Hook → Busca configuração (useApiSettings)
  → Verifica se está ativa (is_active)
  → Usa credenciais para fazer requisições
  → Processa resposta
```

### 3. Sincronização Automática (Opcional)
```
Cron Job / Scheduled Function
  → Busca todas as APIs ativas
  → Executa sincronização
  → Atualiza dados no sistema
```

## 📊 Exemplo de Config JSON

O campo `config` pode armazenar configurações específicas de cada API:

```json
{
  "timeout": 5000,
  "retry": 3,
  "retry_delay": 1000,
  "webhook_url": "https://meusite.com/webhook",
  "sync_interval": 3600,
  "features": {
    "auto_sync": true,
    "sync_prices": true,
    "sync_availability": true
  }
}
```

## 🎯 Casos de Uso Comuns

### 1. Sincronização de Disponibilidade
- Channel Manager envia disponibilidade
- Sistema atualiza quartos automaticamente

### 2. Sincronização de Preços
- Sistema envia preços para Booking Engine
- Preços são atualizados em tempo real

### 3. Processamento de Pagamentos
- Payment Gateway processa pagamentos
- Sistema atualiza status da reserva

### 4. Notificações
- Webhook recebe notificações da API
- Sistema processa e atualiza dados

## 🚀 Próximos Passos

Para implementar uma nova integração:

1. **Criar hook personalizado** (ex: `useBookingEngine.ts`)
2. **Criar funções de sincronização** (ex: `bookingEngineSync.ts`)
3. **Adicionar opção no select** de `api_name` se necessário
4. **Implementar lógica de negócio** usando as configurações
5. **Adicionar tratamento de erros** e validações

## 📚 Referências

- Hook: `src/hooks/useApiSettings.ts`
- Componente: `src/pages/Settings.tsx` (aba Integrações)
- Tabela: `api_settings` no Supabase

