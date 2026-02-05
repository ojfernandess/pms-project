-- Adicionar configuração de plano tarifário para página pública de reservas
-- Permite selecionar qual plano tarifário será usado para exibir preços na página pública

-- ============================================
-- ADICIONAR CAMPO EM HOTEL_SETTINGS
-- ============================================

ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS public_pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_hotel_settings_public_pricing_plan_id 
  ON public.hotel_settings(public_pricing_plan_id) 
  WHERE public_pricing_plan_id IS NOT NULL;

-- Comentário
COMMENT ON COLUMN public.hotel_settings.public_pricing_plan_id IS 
'Plano tarifário a ser usado para exibir preços na página pública de reservas. Se NULL, usa o preço base da categoria.';

