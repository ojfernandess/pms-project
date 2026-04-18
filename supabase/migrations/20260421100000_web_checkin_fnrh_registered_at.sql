-- Marca quando o envio à FNRH (check-in presencial na ficha nacional) foi concluído com sucesso.
ALTER TABLE public.web_checkin
  ADD COLUMN IF NOT EXISTS fnrh_registered_at TIMESTAMPTZ;

COMMENT ON COLUMN public.web_checkin.fnrh_registered_at IS
  'Data/hora em que o registro na FNRH foi concluído (API hospedagem/registrar com sucesso). Diferencia pré check-in web concluído de check-in realizado na ficha.';

CREATE INDEX IF NOT EXISTS idx_web_checkin_fnrh_registered_at
  ON public.web_checkin (fnrh_registered_at)
  WHERE fnrh_registered_at IS NOT NULL;
