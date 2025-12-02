-- Adicionar campos para rastrear cancelamento de reservas
ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Comentários nas novas colunas
COMMENT ON COLUMN public.reservations.cancelled_at IS 'Data e horário em que a reserva foi cancelada';
COMMENT ON COLUMN public.reservations.cancelled_by IS 'ID do usuário que cancelou a reserva';

-- Índice para melhorar performance em consultas de cancelamentos
CREATE INDEX IF NOT EXISTS idx_reservations_cancelled_at ON public.reservations(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_reservations_cancelled_by ON public.reservations(cancelled_by);

