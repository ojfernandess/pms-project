-- Channex Channel Manager: base schema, logs and booking revisions/ack queue

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'ota_channels'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%channel_manager_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.ota_channels DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.ota_channels
  ADD CONSTRAINT ota_channels_channel_manager_type_check
  CHECK (channel_manager_type IS NULL OR channel_manager_type IN ('bukly', 'aiosell', 'channex'));

ALTER TABLE public.ota_channels
  ADD COLUMN IF NOT EXISTS channex_base_url TEXT DEFAULT 'https://staging.channex.io',
  ADD COLUMN IF NOT EXISTS channex_api_key TEXT,
  ADD COLUMN IF NOT EXISTS channex_property_id UUID,
  ADD COLUMN IF NOT EXISTS channex_use_webhook BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS channex_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS channex_sync_status TEXT DEFAULT 'idle'
    CHECK (channex_sync_status IN ('idle', 'syncing', 'success', 'error'));

COMMENT ON COLUMN public.ota_channels.channex_base_url IS 'URL base do Channex API (staging ou produção).';
COMMENT ON COLUMN public.ota_channels.channex_api_key IS 'API key enviada no header user-api-key.';
COMMENT ON COLUMN public.ota_channels.channex_property_id IS 'ID da propriedade no Channex.';
COMMENT ON COLUMN public.ota_channels.channex_use_webhook IS 'Quando true, webhooks do Channex são usados como trigger para pull do feed.';
COMMENT ON COLUMN public.ota_channels.channex_last_sync_at IS 'Último sync ARI/booking no Channex.';
COMMENT ON COLUMN public.ota_channels.channex_sync_status IS 'Estado do último processo Channex.';

CREATE TABLE IF NOT EXISTS public.channex_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('push_ari', 'pull_booking', 'ack_booking', 'webhook')),
  endpoint TEXT,
  http_status INTEGER,
  task_id TEXT,
  status TEXT NOT NULL DEFAULT 'info' CHECK (status IN ('info', 'success', 'warning', 'error')),
  request_payload JSONB,
  response_payload JSONB,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channex_sync_logs_channel ON public.channex_sync_logs(ota_channel_id);
CREATE INDEX IF NOT EXISTS idx_channex_sync_logs_establishment ON public.channex_sync_logs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_channex_sync_logs_created_at ON public.channex_sync_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS public.channex_booking_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL,
  booking_id UUID,
  system_id TEXT,
  unique_id TEXT,
  status TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  acked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  process_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (process_status IN ('pending', 'processed', 'failed', 'acked')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT channex_booking_revisions_unique_revision UNIQUE (ota_channel_id, revision_id)
);

CREATE INDEX IF NOT EXISTS idx_channex_booking_revisions_establishment
  ON public.channex_booking_revisions(establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channex_booking_revisions_status
  ON public.channex_booking_revisions(process_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channex_booking_revisions_booking_id
  ON public.channex_booking_revisions(booking_id);

CREATE TABLE IF NOT EXISTS public.channex_ack_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ota_channel_id UUID NOT NULL REFERENCES public.ota_channels(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acked', 'failed')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT channex_ack_queue_unique_revision UNIQUE (ota_channel_id, revision_id)
);

CREATE INDEX IF NOT EXISTS idx_channex_ack_queue_pending
  ON public.channex_ack_queue(status, next_attempt_at);

ALTER TABLE public.channex_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channex_booking_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channex_ack_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channex_sync_logs' AND policyname = 'Users can view channex sync logs from their establishment'
  ) THEN
    CREATE POLICY "Users can view channex sync logs from their establishment"
      ON public.channex_sync_logs
      FOR SELECT
      USING (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channex_sync_logs' AND policyname = 'Service role can insert channex sync logs'
  ) THEN
    CREATE POLICY "Service role can insert channex sync logs"
      ON public.channex_sync_logs
      FOR INSERT
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channex_booking_revisions' AND policyname = 'Users can view channex booking revisions from their establishment'
  ) THEN
    CREATE POLICY "Users can view channex booking revisions from their establishment"
      ON public.channex_booking_revisions
      FOR SELECT
      USING (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channex_booking_revisions' AND policyname = 'Service role can write channex booking revisions'
  ) THEN
    CREATE POLICY "Service role can write channex booking revisions"
      ON public.channex_booking_revisions
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channex_ack_queue' AND policyname = 'Users can view channex ack queue from their establishment'
  ) THEN
    CREATE POLICY "Users can view channex ack queue from their establishment"
      ON public.channex_ack_queue
      FOR SELECT
      USING (public.user_can_access_establishment(auth.uid(), establishment_id));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channex_ack_queue' AND policyname = 'Service role can write channex ack queue'
  ) THEN
    CREATE POLICY "Service role can write channex ack queue"
      ON public.channex_ack_queue
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
