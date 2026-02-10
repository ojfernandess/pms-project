-- Adiciona suporte a empresas no Motor de Reservas
-- Permite que o motor funcione por empresa, mostrando todos os estabelecimentos da empresa

-- Tabela para controlar quais estabelecimentos estão no motor de reservas de uma empresa
CREATE TABLE IF NOT EXISTS public.company_booking_engine_establishments (
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
CREATE INDEX IF NOT EXISTS idx_company_booking_engine_company_id ON public.company_booking_engine_establishments(company_id);
CREATE INDEX IF NOT EXISTS idx_company_booking_engine_establishment_id ON public.company_booking_engine_establishments(establishment_id);

-- Adiciona campos de configuração do motor por empresa (opcional, pode usar hotel_settings também)
-- Por enquanto, vamos usar hotel_settings com uma lógica de empresa
-- Mas adicionamos um campo para identificar se o motor está ativo por empresa
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_engine_theme TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS booking_engine_custom_domain TEXT UNIQUE;

COMMENT ON COLUMN public.companies.booking_engine_enabled IS
  'Se o motor de reservas está ativado para esta empresa';
COMMENT ON COLUMN public.companies.booking_engine_theme IS
  'Tema visual do motor de reservas da empresa (default, modern, luxury, minimal, dark)';
COMMENT ON COLUMN public.companies.booking_engine_custom_domain IS
  'Domínio personalizado para o motor de reservas da empresa (ex.: reservas.empresa.com.br)';

COMMENT ON TABLE public.company_booking_engine_establishments IS
  'Controla quais estabelecimentos aparecem no motor de reservas de uma empresa';

