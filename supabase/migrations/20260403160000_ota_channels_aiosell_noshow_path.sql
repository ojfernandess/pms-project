-- Path opcional para NoShow Push (PMS → Aiosell). Confirmar no onboarding / KB.
ALTER TABLE public.ota_channels
  ADD COLUMN IF NOT EXISTS aiosell_noshow_path TEXT;

COMMENT ON COLUMN public.ota_channels.aiosell_noshow_path IS
  'Path relativo à aiosell_base_url para push de no-show (ex.: artigo KB «noshow-push-from-pms-to-aiosell»). Preencher quando o suporte Aiosell fornecer o endpoint; a Edge Function pode usar no futuro.';
