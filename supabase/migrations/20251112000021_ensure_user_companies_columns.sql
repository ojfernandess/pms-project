-- Garantir que as colunas max_companies e max_establishments existam na tabela user_companies
ALTER TABLE public.user_companies 
  ADD COLUMN IF NOT EXISTS max_companies INTEGER DEFAULT 1;

ALTER TABLE public.user_companies 
  ADD COLUMN IF NOT EXISTS max_establishments INTEGER DEFAULT 1;

-- Comentários explicativos
COMMENT ON COLUMN public.user_companies.max_companies IS 'Quantidade máxima de empresas que o usuário pode gerenciar';
COMMENT ON COLUMN public.user_companies.max_establishments IS 'Quantidade máxima de estabelecimentos que o usuário pode criar por empresa';

