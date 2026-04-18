# Edge Function: Processamento Automático de No-Shows

## 📋 Descrição

Esta Edge Function processa automaticamente reservas que se tornaram no-show (passaram do horário de check-in sem check-in realizado).

## 🚀 Deploy

### 1. Instalar Supabase CLI

```bash
npm install -g supabase
```

### 2. Fazer Login

```bash
supabase login
```

### 3. Linkar Projeto

```bash
supabase link --project-ref seu-project-ref
```

### 4. Deploy da Function

```bash
supabase functions deploy process-no-shows
```

## ⏰ Configurar Cron Job

### Opção 1: Via Supabase Dashboard

1. Acesse **Database** > **Cron Jobs**
2. Clique em **New Cron Job**
3. Configure:
   - **Name:** `process-no-shows-daily`
   - **Schedule:** `0 19 * * *` (todos os dias às 19:00)
   - **Function:** `process-no-shows`
   - **Payload (opcional):**
     ```json
     {
       "process_time": "2025-01-25T19:00:00Z"
     }
     ```

### Opção 2: Via SQL

```sql
-- Criar cron job para executar diariamente às 19:00
SELECT cron.schedule(
  'process-no-shows-daily',
  '0 19 * * *', -- Todos os dias às 19:00 (formato cron)
  $$
  SELECT
    net.http_post(
      url := 'https://seu-project-ref.supabase.co/functions/v1/process-no-shows',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'process_time', NOW()::text
      )
    ) AS request_id;
  $$
);
```

### Opção 3: Configurar Horário Personalizado

Para permitir que o usuário configure o horário, você pode:

1. Criar uma tabela de configurações:
```sql
CREATE TABLE IF NOT EXISTS public.no_show_schedule_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
  schedule_time TIME NOT NULL DEFAULT '19:00:00',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

2. Modificar a Edge Function para ler a configuração e executar no horário configurado

## 🔧 Configuração de Horário Personalizado

Para permitir que o usuário configure o horário via interface:

1. Criar componente de configuração
2. Salvar horário na tabela `no_show_schedule_config`
3. Criar múltiplos cron jobs ou usar um único que verifica a configuração

## 📊 Monitoramento

A função retorna:
```json
{
  "success": true,
  "processed": 5,
  "method": "rpc",
  "message": "5 no-show(s) processado(s)"
}
```

## 🔍 Logs

Ver logs em:
- Supabase Dashboard > **Edge Functions** > **process-no-shows** > **Logs**

## ⚠️ Notas

- A função usa `SUPABASE_SERVICE_ROLE_KEY` para bypass de RLS
- Processa todas as reservas ou apenas de um estabelecimento específico
- Fallback automático se função RPC não existir

