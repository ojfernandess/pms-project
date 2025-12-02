-- Adicionar campos de país, nacionalidade e código postal à tabela web_checkin_guests
ALTER TABLE public.web_checkin_guests
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT;

-- Comentários
COMMENT ON COLUMN public.web_checkin_guests.country IS 'País do endereço do hóspede (para endereços estrangeiros)';
COMMENT ON COLUMN public.web_checkin_guests.nationality IS 'Nacionalidade do hóspede';
COMMENT ON COLUMN public.web_checkin_guests.postal_code IS 'Código postal do endereço do hóspede (para endereços estrangeiros)';



