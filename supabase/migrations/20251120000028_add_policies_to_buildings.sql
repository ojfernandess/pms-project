-- Adicionar campo policies (JSONB) na tabela buildings para armazenar políticas do prédio
ALTER TABLE public.buildings
ADD COLUMN IF NOT EXISTS policies JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.buildings.policies IS 'Políticas do prédio (cancelamento, check-in/check-out, animais, etc.) em formato JSON';

