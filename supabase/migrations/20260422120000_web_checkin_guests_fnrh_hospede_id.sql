-- UUID retornado pela FNRH em hospedagem/registrar (PATCH /hospedes/{id}/noshow)
ALTER TABLE public.web_checkin_guests
  ADD COLUMN IF NOT EXISTS fnrh_hospede_id TEXT;

COMMENT ON COLUMN public.web_checkin_guests.fnrh_hospede_id IS
  'Identificador do hóspede na API FNRH v2 (hospede_id), preenchido após hospedagem/registrar bem-sucedido.';
