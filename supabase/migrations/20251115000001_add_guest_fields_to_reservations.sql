-- Adicionar campos para suportar responsável financeiro diferente do hóspede
-- guest_id: ID do cliente que é o hóspede (pode ser diferente do client_id que é o responsável financeiro)
-- guest_name: Nome do hóspede para facilitar queries (desnormalizado para performance)

ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Comentários das colunas
COMMENT ON COLUMN public.reservations.guest_id IS 'ID do cliente que é o hóspede. Se NULL ou igual a client_id, o cliente é o responsável financeiro e o hóspede';
COMMENT ON COLUMN public.reservations.guest_name IS 'Nome do hóspede (desnormalizado para performance nas queries)';

-- Atualizar registros existentes para que guest_id seja igual a client_id (modo simples)
UPDATE public.reservations 
SET guest_id = client_id 
WHERE guest_id IS NULL;

-- Criar índice para melhorar performance das queries por hóspede
CREATE INDEX IF NOT EXISTS idx_reservations_guest_id ON public.reservations(guest_id);

