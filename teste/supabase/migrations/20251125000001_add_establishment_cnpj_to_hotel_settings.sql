-- Adicionar campos para CNPJ do estabelecimento e opção de exibir no recibo
ALTER TABLE public.hotel_settings
ADD COLUMN IF NOT EXISTS establishment_cnpj TEXT,
ADD COLUMN IF NOT EXISTS show_establishment_cnpj BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.hotel_settings.establishment_cnpj IS 'CNPJ do estabelecimento para exibição no recibo (apenas números, 14 dígitos).';
COMMENT ON COLUMN public.hotel_settings.show_establishment_cnpj IS 'Indica se o CNPJ do estabelecimento deve ser exibido no recibo gerado.';

