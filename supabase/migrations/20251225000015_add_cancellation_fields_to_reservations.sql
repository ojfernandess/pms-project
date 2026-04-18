-- Migration: Adicionar campos de cancelamento e no-show em reservations
-- Suporta cálculo automático de multas e auditoria

-- Adicionar campos de cancelamento
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS cancellation_penalty DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_policy_applied UUID REFERENCES public.cancellation_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS no_show_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancellation_calculation_details JSONB; -- Detalhes do cálculo da multa

-- Criar tabela de logs de cancelamento
CREATE TABLE IF NOT EXISTS public.cancellation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE NOT NULL,
  policy_id UUID REFERENCES public.cancellation_policies(id) ON DELETE SET NULL,
  cancellation_date TIMESTAMP WITH TIME ZONE NOT NULL,
  checkin_date TIMESTAMP WITH TIME ZONE NOT NULL,
  penalty_amount DECIMAL(10,2) DEFAULT 0,
  penalty_type TEXT NOT NULL CHECK (penalty_type IN ('none', 'cancellation', 'no_show')),
  calculation_details JSONB,
  reason TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  channel TEXT DEFAULT 'direct', -- 'direct', 'booking', 'expedia', etc.
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_cancellation_logs_reservation 
  ON public.cancellation_logs(reservation_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_logs_policy 
  ON public.cancellation_logs(policy_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_logs_date 
  ON public.cancellation_logs(cancellation_date);

CREATE INDEX IF NOT EXISTS idx_reservations_cancelled_at 
  ON public.reservations(cancelled_at);

CREATE INDEX IF NOT EXISTS idx_reservations_no_show_at 
  ON public.reservations(no_show_at);

-- Comentários
COMMENT ON COLUMN public.reservations.cancellation_penalty IS 'Valor da multa de cancelamento calculada automaticamente';
COMMENT ON COLUMN public.reservations.cancellation_policy_applied IS 'Política de cancelamento aplicada no momento do cancelamento';
COMMENT ON COLUMN public.reservations.cancellation_calculation_details IS 'Detalhes do cálculo da multa (JSON)';
COMMENT ON COLUMN public.reservations.cancellation_reason IS 'Motivo do cancelamento informado pelo usuário';
COMMENT ON COLUMN public.reservations.cancelled_at IS 'Data e hora do cancelamento';
COMMENT ON COLUMN public.reservations.no_show_at IS 'Data e hora em que foi detectado no-show';

COMMENT ON TABLE public.cancellation_logs IS 'Logs de auditoria de cancelamentos e no-shows';
COMMENT ON COLUMN public.cancellation_logs.penalty_type IS 'Tipo de penalidade: none, cancellation, no_show';
COMMENT ON COLUMN public.cancellation_logs.channel IS 'Canal de origem da reserva (direct, booking, expedia, etc.)';
COMMENT ON COLUMN public.cancellation_logs.calculation_details IS 'Detalhes do cálculo da multa (JSON)';

