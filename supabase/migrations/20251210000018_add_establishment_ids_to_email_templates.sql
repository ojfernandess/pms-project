-- Adicionar campo establishment_ids na tabela email_templates
-- Permite que cada template seja usado apenas por estabelecimentos específicos

ALTER TABLE public.email_templates 
  ADD COLUMN IF NOT EXISTS establishment_ids JSONB DEFAULT '[]'::jsonb;

-- Comentário explicativo
COMMENT ON COLUMN public.email_templates.establishment_ids IS 
  'Array de IDs de estabelecimentos que podem usar este template. Se vazio ([]), o template está disponível para todos os estabelecimentos que têm o sistema de e-mail habilitado.';

-- Criar índice para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_email_templates_establishment_ids 
  ON public.email_templates USING GIN (establishment_ids);

