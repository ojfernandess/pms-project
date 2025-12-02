-- Adicionar campos de customização do PMS na tabela companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS pms_logo_url TEXT,
ADD COLUMN IF NOT EXISTS pms_custom_name TEXT;

COMMENT ON COLUMN public.companies.pms_logo_url IS 'URL da logo customizada do PMS para esta empresa, armazenada no bucket hotel-assets';
COMMENT ON COLUMN public.companies.pms_custom_name IS 'Nome customizado do PMS para esta empresa (exibido no menu lateral)';

