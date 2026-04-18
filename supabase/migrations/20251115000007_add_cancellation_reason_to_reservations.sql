-- Adicionar campo para motivo do cancelamento
ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Comentário na nova coluna
COMMENT ON COLUMN public.reservations.cancellation_reason IS 'Motivo do cancelamento da reserva informado pelo usuário';

