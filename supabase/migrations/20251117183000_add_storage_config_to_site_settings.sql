ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS storage_config JSONB DEFAULT '{"provider":"local"}'::jsonb;

COMMENT ON COLUMN public.site_settings.storage_config IS
  'Provedor de armazenamento do PMS: local (disco na API) ou minio (S3-compatível). Configuração sensível — acesso apenas super admin.';