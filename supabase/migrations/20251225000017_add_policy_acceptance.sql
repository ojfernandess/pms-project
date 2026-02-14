-- Migration: Adicionar tabela para registro de aceite de políticas de cancelamento
-- Permite registrar quando hóspede aceita política no motor de reservas

CREATE TABLE IF NOT EXISTS public.cancellation_policy_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.cancellation_policies(id) ON DELETE SET NULL,
  accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  channel TEXT DEFAULT 'booking_engine', -- 'booking_engine', 'direct', 'ota', etc.
  accepted_by TEXT, -- Nome do hóspede ou identificador
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_policy_acceptances_reservation 
  ON public.cancellation_policy_acceptances(reservation_id);

CREATE INDEX IF NOT EXISTS idx_policy_acceptances_policy 
  ON public.cancellation_policy_acceptances(policy_id);

CREATE INDEX IF NOT EXISTS idx_policy_acceptances_accepted_at 
  ON public.cancellation_policy_acceptances(accepted_at);

-- Comentários
COMMENT ON TABLE public.cancellation_policy_acceptances IS 'Registro de aceite de políticas de cancelamento por hóspedes';
COMMENT ON COLUMN public.cancellation_policy_acceptances.channel IS 'Canal onde o aceite foi realizado (booking_engine, direct, ota, etc.)';
COMMENT ON COLUMN public.cancellation_policy_acceptances.accepted_by IS 'Nome do hóspede ou identificador que aceitou a política';

