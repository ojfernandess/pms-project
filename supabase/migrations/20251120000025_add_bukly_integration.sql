-- Adicionar suporte para Bukly Channel Manager
-- Campos específicos para integração com Bukly

-- Adicionar coluna para identificar se é um channel manager (Bukly) ou OTA direta
ALTER TABLE public.ota_channels
ADD COLUMN IF NOT EXISTS channel_type TEXT DEFAULT 'ota' CHECK (channel_type IN ('ota', 'channel_manager'));

-- Adicionar coluna para identificar o channel manager (se aplicável)
ALTER TABLE public.ota_channels
ADD COLUMN IF NOT EXISTS channel_manager_type TEXT CHECK (channel_manager_type IN ('bukly', NULL));

-- Adicionar campos específicos do Bukly
ALTER TABLE public.ota_channels
ADD COLUMN IF NOT EXISTS bukly_api_url TEXT,
ADD COLUMN IF NOT EXISTS bukly_hotel_id TEXT,
ADD COLUMN IF NOT EXISTS bukly_webhook_secret TEXT,
ADD COLUMN IF NOT EXISTS bukly_sync_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS bukly_last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS bukly_sync_status TEXT DEFAULT 'idle' CHECK (bukly_sync_status IN ('idle', 'syncing', 'success', 'error'));

-- Criar tabela para armazenar logs de sincronização com Bukly
CREATE TABLE IF NOT EXISTS public.bukly_sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('rates', 'availability', 'restrictions', 'full')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error')),
  records_synced INTEGER DEFAULT 0,
  error_message TEXT,
  sync_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_bukly_sync_logs_channel ON public.bukly_sync_logs(ota_channel_id);
CREATE INDEX IF NOT EXISTS idx_bukly_sync_logs_establishment ON public.bukly_sync_logs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_bukly_sync_logs_created_at ON public.bukly_sync_logs(created_at DESC);

-- Criar tabela para armazenar webhooks recebidos do Bukly
CREATE TABLE IF NOT EXISTS public.bukly_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  webhook_type TEXT NOT NULL CHECK (webhook_type IN ('booking', 'modification', 'cancellation')),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_bukly_webhooks_channel ON public.bukly_webhooks(ota_channel_id);
CREATE INDEX IF NOT EXISTS idx_bukly_webhooks_processed ON public.bukly_webhooks(processed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bukly_webhooks_type ON public.bukly_webhooks(webhook_type);

-- Habilitar RLS
ALTER TABLE public.bukly_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bukly_webhooks ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para bukly_sync_logs
CREATE POLICY "Allow authenticated users to read bukly sync logs"
  ON public.bukly_sync_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert bukly sync logs"
  ON public.bukly_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas RLS para bukly_webhooks
CREATE POLICY "Allow authenticated users to read bukly webhooks"
  ON public.bukly_webhooks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert bukly webhooks"
  ON public.bukly_webhooks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update bukly webhooks"
  ON public.bukly_webhooks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Comentários para documentação
COMMENT ON COLUMN public.ota_channels.channel_type IS 'Tipo de canal: ota (OTA direta) ou channel_manager (Channel Manager como Bukly)';
COMMENT ON COLUMN public.ota_channels.channel_manager_type IS 'Tipo de channel manager: bukly ou NULL';
COMMENT ON COLUMN public.ota_channels.bukly_api_url IS 'URL base da API do Bukly';
COMMENT ON COLUMN public.ota_channels.bukly_hotel_id IS 'ID do hotel no sistema Bukly';
COMMENT ON COLUMN public.ota_channels.bukly_webhook_secret IS 'Secret para validar webhooks do Bukly';
COMMENT ON TABLE public.bukly_sync_logs IS 'Logs de sincronização com Bukly Channel Manager';
COMMENT ON TABLE public.bukly_webhooks IS 'Webhooks recebidos do Bukly Channel Manager';

