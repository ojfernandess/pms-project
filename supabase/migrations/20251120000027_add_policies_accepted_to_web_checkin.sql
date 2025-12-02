-- Adicionar campos para rastrear aceite das políticas no web_checkin
ALTER TABLE public.web_checkin
ADD COLUMN IF NOT EXISTS policies_accepted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS policies_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.web_checkin.policies_accepted IS 'Indica se o hóspede aceitou as políticas do estabelecimento';
COMMENT ON COLUMN public.web_checkin.policies_accepted_at IS 'Data e hora em que o hóspede aceitou as políticas';




