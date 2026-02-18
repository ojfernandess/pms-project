-- ============================================
-- Cobrança de Check-in: origem de templates por canal
-- internal = templates do sistema (checkin_charge_templates / Evolution)
-- meta = templates oficiais WhatsApp Cloud API (Meta)
-- chatwoot = Canned Responses do Chatwoot
-- ============================================

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS template_source TEXT NOT NULL DEFAULT 'internal'
    CHECK (template_source IN ('internal', 'meta', 'chatwoot'));

COMMENT ON COLUMN public.checkin_charge_config.template_source IS 'Origem do template: internal (sistema/Evolution), meta (WhatsApp oficial), chatwoot (Canned Responses)';

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS meta_template_name TEXT;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS meta_template_language TEXT;

-- Ordem das variáveis para preencher parâmetros do body do template Meta ({{1}}, {{2}}, ...)
ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS meta_template_body_variables JSONB DEFAULT '["guest_name","reservation_code","checkin_date","amount","payment_link","web_checkin_link"]'::jsonb;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS chatwoot_canned_response_id INTEGER;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS chatwoot_canned_response_short_code TEXT;

COMMENT ON COLUMN public.checkin_charge_config.meta_template_name IS 'Nome do template aprovado na Meta (WhatsApp Business)';
COMMENT ON COLUMN public.checkin_charge_config.meta_template_language IS 'Código do idioma do template (ex: pt_BR)';
COMMENT ON COLUMN public.checkin_charge_config.chatwoot_canned_response_id IS 'ID da Canned Response no Chatwoot';
COMMENT ON COLUMN public.checkin_charge_config.chatwoot_canned_response_short_code IS 'Short code da Canned Response no Chatwoot';
