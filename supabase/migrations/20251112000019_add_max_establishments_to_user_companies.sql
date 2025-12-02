-- Adicionar campo max_establishments à tabela user_companies
ALTER TABLE public.user_companies 
  ADD COLUMN IF NOT EXISTS max_establishments INTEGER DEFAULT 1;

-- Comentário explicativo
COMMENT ON COLUMN public.user_companies.max_establishments IS 'Quantidade máxima de estabelecimentos que o usuário pode criar por empresa';

