-- ============================================
-- ADICIONAR CONFIGURAÇÃO DE 2 PLANOS TARIFÁRIOS PARA PÁGINA PÚBLICA
-- ============================================
-- Permite selecionar 2 planos tarifários para exibição na página pública,
-- cada um com seu próprio título personalizado

-- Adicionar campos para o primeiro plano tarifário
ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS public_pricing_plan_1_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL;

ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS public_pricing_plan_1_title TEXT;

-- Adicionar campos para o segundo plano tarifário
ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS public_pricing_plan_2_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL;

ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS public_pricing_plan_2_title TEXT;

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_hotel_settings_public_pricing_plan_1_id 
  ON public.hotel_settings(public_pricing_plan_1_id) 
  WHERE public_pricing_plan_1_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hotel_settings_public_pricing_plan_2_id 
  ON public.hotel_settings(public_pricing_plan_2_id) 
  WHERE public_pricing_plan_2_id IS NOT NULL;

-- Comentários
COMMENT ON COLUMN public.hotel_settings.public_pricing_plan_1_id IS 
'Primeiro plano tarifário a ser exibido na página pública de reservas. Se NULL, não será exibido.';

COMMENT ON COLUMN public.hotel_settings.public_pricing_plan_1_title IS 
'Título personalizado para o primeiro plano tarifário na página pública (ex: "Suíte Deluxe - Não Reembolsável").';

COMMENT ON COLUMN public.hotel_settings.public_pricing_plan_2_id IS 
'Segundo plano tarifário a ser exibido na página pública de reservas. Se NULL, não será exibido.';

COMMENT ON COLUMN public.hotel_settings.public_pricing_plan_2_title IS 
'Título personalizado para o segundo plano tarifário na página pública (ex: "Suíte Deluxe - Reembolsável").';

