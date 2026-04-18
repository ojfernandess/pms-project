-- Adicionar campo para rastrear quando uma pendência foi resolvida
ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS pending_resolved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pending_resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Comentários nas novas colunas
COMMENT ON COLUMN public.reservations.pending_resolved_at IS 'Data e horário em que a pendência foi marcada como resolvida';
COMMENT ON COLUMN public.reservations.pending_resolved_by IS 'ID do usuário que marcou a pendência como resolvida';

-- Índice para melhorar performance em consultas de pendências resolvidas
CREATE INDEX IF NOT EXISTS idx_reservations_pending_resolved_at ON public.reservations(pending_resolved_at);
CREATE INDEX IF NOT EXISTS idx_reservations_pending_resolved_by ON public.reservations(pending_resolved_by);

