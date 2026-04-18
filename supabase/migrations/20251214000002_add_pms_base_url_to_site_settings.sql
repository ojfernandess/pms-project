-- Adicionar campo para URL base do PMS na tabela site_settings
-- Esta URL será usada para gerar links de check-in online e políticas nos emails
-- Diferente da URL do site do estabelecimento, esta é a URL do sistema PMS

ALTER TABLE public.site_settings 
  ADD COLUMN IF NOT EXISTS pms_base_url TEXT;

-- Comentário explicativo
COMMENT ON COLUMN public.site_settings.pms_base_url IS 
  'URL base do sistema PMS usada para gerar links de check-in online e políticas nos emails. Exemplo: https://pms.exemplo.com. Esta URL é diferente da URL do site do estabelecimento (hotel_settings.website), que pode variar por estabelecimento.';

-- Atualizar registro existente (deixar null por padrão para não quebrar funcionalidade existente)
UPDATE public.site_settings
SET pms_base_url = NULL
WHERE id = '00000000-0000-0000-0000-000000000001' AND pms_base_url IS NULL;

