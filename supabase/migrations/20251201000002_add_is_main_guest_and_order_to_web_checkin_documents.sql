-- Adicionar campos is_main_guest e order à tabela web_checkin_documents
ALTER TABLE public.web_checkin_documents
  ADD COLUMN IF NOT EXISTS is_main_guest BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;

-- Comentários
COMMENT ON COLUMN public.web_checkin_documents.is_main_guest IS 'Indica se o documento pertence ao hóspede principal';
COMMENT ON COLUMN public.web_checkin_documents."order" IS 'Ordem do hóspede (0 para principal, 1+ para acompanhantes)';

-- Criar índice para melhorar consultas por is_main_guest
CREATE INDEX IF NOT EXISTS idx_web_checkin_documents_is_main_guest 
  ON public.web_checkin_documents(web_checkin_id, is_main_guest);

-- Criar índice para melhorar consultas por order
CREATE INDEX IF NOT EXISTS idx_web_checkin_documents_order 
  ON public.web_checkin_documents(web_checkin_id, "order");

