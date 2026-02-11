-- Adicionar campos de contato geral do motor de reservas
ALTER TABLE public.companies 
  ADD COLUMN IF NOT EXISTS booking_engine_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_contact_whatsapp_ddi TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_contact_whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS booking_engine_contact_cnpj TEXT;

-- Comentários
COMMENT ON COLUMN public.companies.booking_engine_contact_phone IS 'Telefone de contato geral do motor de reservas (exibido no rodapé)';
COMMENT ON COLUMN public.companies.booking_engine_contact_whatsapp_ddi IS 'DDI do WhatsApp de contato geral do motor de reservas';
COMMENT ON COLUMN public.companies.booking_engine_contact_whatsapp_number IS 'Número do WhatsApp de contato geral do motor de reservas';
COMMENT ON COLUMN public.companies.booking_engine_contact_email IS 'Email de contato geral do motor de reservas (exibido no rodapé)';
COMMENT ON COLUMN public.companies.booking_engine_contact_cnpj IS 'CNPJ da empresa para exibição no rodapé do motor de reservas';

