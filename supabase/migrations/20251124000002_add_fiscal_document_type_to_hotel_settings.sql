-- Adicionar campo para tipo de documento fiscal (Nota Fiscal / Recibo)
ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS fiscal_document_type TEXT DEFAULT 'both';

-- Constraint para validar os valores permitidos
ALTER TABLE public.hotel_settings 
  DROP CONSTRAINT IF EXISTS valid_fiscal_document_type;

ALTER TABLE public.hotel_settings 
  ADD CONSTRAINT valid_fiscal_document_type 
  CHECK (fiscal_document_type IN ('invoice', 'receipt', 'both'));

-- Comentário explicativo
COMMENT ON COLUMN public.hotel_settings.fiscal_document_type IS 'Tipo de documento fiscal emitido: invoice (Nota Fiscal), receipt (Recibo) ou both (Ambos)';

-- Atualizar registros existentes para ter valor padrão
UPDATE public.hotel_settings 
  SET fiscal_document_type = 'both' 
  WHERE fiscal_document_type IS NULL;


