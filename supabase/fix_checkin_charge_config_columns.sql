-- ============================================================
-- Corrigir erro: "Could not find the 'chatwoot_canned_response_id' column"
-- ============================================================
-- Execute no Supabase Dashboard > SQL Editor > New query.
-- Cole o conteúdo abaixo e clique em Run.
-- ============================================================

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS template_source TEXT NOT NULL DEFAULT 'internal'
    CHECK (template_source IN ('internal', 'meta', 'chatwoot'));

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS meta_template_name TEXT;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS meta_template_language TEXT;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS meta_template_body_variables JSONB DEFAULT '["guest_name","reservation_code","checkin_date","amount","payment_link","web_checkin_link"]'::jsonb;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS chatwoot_canned_response_id INTEGER;

ALTER TABLE public.checkin_charge_config
  ADD COLUMN IF NOT EXISTS chatwoot_canned_response_short_code TEXT;
