-- ============================================
-- ADICIONAR SLUG PARA MOTOR DE RESERVAS
-- ============================================
-- Adiciona campo slug na tabela companies para criar URLs amigáveis
-- O slug será gerado a partir do título do motor de reservas

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_slug TEXT UNIQUE;

-- Criar índice para busca rápida por slug
CREATE INDEX IF NOT EXISTS idx_companies_booking_engine_slug ON public.companies(booking_engine_slug);

-- Comentário explicativo
COMMENT ON COLUMN public.companies.booking_engine_slug IS 
'Slug único para o motor de reservas da empresa, gerado a partir do título. Usado para criar URLs amigáveis como /motor/slug-da-empresa';

