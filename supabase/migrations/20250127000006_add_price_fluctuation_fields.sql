-- =====================================================
-- ADICIONAR CAMPOS DE FLUTUAÇÃO DE PREÇO
-- =====================================================
-- Adiciona campos para armazenar o tipo e valor de flutuação
-- aplicada a cada ocupação (x1, x3, x4)

-- Adicionar campos de flutuação para cada ocupação
ALTER TABLE public.rate_calendar
  ADD COLUMN IF NOT EXISTS occupancy_1_fluctuation_type TEXT CHECK (occupancy_1_fluctuation_type IN ('fixed', 'percentage')),
  ADD COLUMN IF NOT EXISTS occupancy_1_fluctuation_value DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS occupancy_3_fluctuation_type TEXT CHECK (occupancy_3_fluctuation_type IN ('fixed', 'percentage')),
  ADD COLUMN IF NOT EXISTS occupancy_3_fluctuation_value DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS occupancy_4_fluctuation_type TEXT CHECK (occupancy_4_fluctuation_type IN ('fixed', 'percentage')),
  ADD COLUMN IF NOT EXISTS occupancy_4_fluctuation_value DECIMAL(10,2);

-- Comentários para documentação
COMMENT ON COLUMN public.rate_calendar.occupancy_1_fluctuation_type IS 'Tipo de flutuação aplicada ao preço x1: fixed (valor absoluto) ou percentage (porcentagem)';
COMMENT ON COLUMN public.rate_calendar.occupancy_1_fluctuation_value IS 'Valor da flutuação aplicada ao preço x1';
COMMENT ON COLUMN public.rate_calendar.occupancy_3_fluctuation_type IS 'Tipo de flutuação aplicada ao preço x3: fixed (valor absoluto) ou percentage (porcentagem)';
COMMENT ON COLUMN public.rate_calendar.occupancy_3_fluctuation_value IS 'Valor da flutuação aplicada ao preço x3';
COMMENT ON COLUMN public.rate_calendar.occupancy_4_fluctuation_type IS 'Tipo de flutuação aplicada ao preço x4: fixed (valor absoluto) ou percentage (porcentagem)';
COMMENT ON COLUMN public.rate_calendar.occupancy_4_fluctuation_value IS 'Valor da flutuação aplicada ao preço x4';

