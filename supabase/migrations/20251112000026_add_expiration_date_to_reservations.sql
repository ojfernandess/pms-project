-- Adicionar campo expiration_date na tabela reservations para pré-reservas
ALTER TABLE public.reservations
ADD COLUMN IF NOT EXISTS expiration_date TIMESTAMPTZ;

COMMENT ON COLUMN public.reservations.expiration_date IS 'Data e hora de expiração para pré-reservas. Após esta data/hora, a pré-reserva pode ser automaticamente removida se não for efetivada.';

