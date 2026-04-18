-- Adicionar campo policies (JSONB) na tabela hotel_settings para armazenar políticas do estabelecimento
ALTER TABLE public.hotel_settings
ADD COLUMN IF NOT EXISTS policies JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hotel_settings.policies IS 'Políticas do estabelecimento (cancelamento, check-in/check-out, animais, etc.) em formato JSON';

