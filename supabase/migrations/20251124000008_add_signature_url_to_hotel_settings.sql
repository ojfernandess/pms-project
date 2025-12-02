-- Adicionar campo signature_url à tabela hotel_settings para armazenar URL da assinatura digital
ALTER TABLE public.hotel_settings
ADD COLUMN IF NOT EXISTS signature_url TEXT;

COMMENT ON COLUMN public.hotel_settings.signature_url IS 'URL da assinatura digital do estabelecimento que será inserida nos PDFs de recibo';

