-- Adiciona suporte para gerenciar páginas públicas de reservas por empresa
-- Permite que a empresa selecione quais estabelecimentos terão página pública

-- Tabela para controlar quais estabelecimentos terão página pública de reservas
CREATE TABLE IF NOT EXISTS public.company_public_reservation_establishments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, establishment_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_company_public_reservation_company_id 
  ON public.company_public_reservation_establishments(company_id);
CREATE INDEX IF NOT EXISTS idx_company_public_reservation_establishment_id 
  ON public.company_public_reservation_establishments(establishment_id);

COMMENT ON TABLE public.company_public_reservation_establishments IS
  'Controla quais estabelecimentos de uma empresa terão página pública de reservas ativa';

COMMENT ON COLUMN public.company_public_reservation_establishments.display_order IS
  'Ordem de exibição dos estabelecimentos (se aplicável)';

COMMENT ON COLUMN public.company_public_reservation_establishments.is_active IS
  'Se a página pública está ativa para este estabelecimento';

