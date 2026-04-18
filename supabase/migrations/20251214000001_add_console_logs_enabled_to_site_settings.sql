-- Adicionar campo para controlar logs do console na tabela site_settings
-- Permite ativar/desativar todos os logs do console através do Super Admin

ALTER TABLE public.site_settings 
  ADD COLUMN IF NOT EXISTS console_logs_enabled BOOLEAN DEFAULT true;

-- Comentário explicativo
COMMENT ON COLUMN public.site_settings.console_logs_enabled IS 
  'Controla se os logs do console estão habilitados. Quando false, todos os console.log, console.warn, console.info, console.debug são suprimidos. console.error sempre loga por padrão.';

-- Atualizar registro existente para habilitar logs por padrão
UPDATE public.site_settings
SET console_logs_enabled = COALESCE(console_logs_enabled, true)
WHERE id = '00000000-0000-0000-0000-000000000001';

