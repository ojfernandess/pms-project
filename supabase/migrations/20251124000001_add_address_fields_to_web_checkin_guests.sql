-- Adicionar campos de endereço à tabela web_checkin_guests
ALTER TABLE public.web_checkin_guests
  ADD COLUMN IF NOT EXISTS zip_code TEXT,
  ADD COLUMN IF NOT EXISTS street TEXT,
  ADD COLUMN IF NOT EXISTS number TEXT,
  ADD COLUMN IF NOT EXISTS complement TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT;

-- Comentários
COMMENT ON COLUMN public.web_checkin_guests.zip_code IS 'CEP do endereço do hóspede';
COMMENT ON COLUMN public.web_checkin_guests.street IS 'Rua do endereço do hóspede';
COMMENT ON COLUMN public.web_checkin_guests.number IS 'Número do endereço do hóspede';
COMMENT ON COLUMN public.web_checkin_guests.complement IS 'Complemento do endereço do hóspede';
COMMENT ON COLUMN public.web_checkin_guests.neighborhood IS 'Bairro do endereço do hóspede';
COMMENT ON COLUMN public.web_checkin_guests.city IS 'Cidade do endereço do hóspede';
COMMENT ON COLUMN public.web_checkin_guests.state IS 'Estado (UF) do endereço do hóspede';


