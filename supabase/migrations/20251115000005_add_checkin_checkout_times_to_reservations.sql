-- Adicionar campos de horário de check-in e check-out à tabela reservations
ALTER TABLE public.reservations 
  ADD COLUMN IF NOT EXISTS checkin_time TIME,
  ADD COLUMN IF NOT EXISTS checkout_time TIME;

-- Comentários nas novas colunas
COMMENT ON COLUMN public.reservations.checkin_time IS 'Horário de check-in da reserva. Se NULL, usar horário padrão das configurações do hotel';
COMMENT ON COLUMN public.reservations.checkout_time IS 'Horário de check-out da reserva. Se NULL, usar horário padrão das configurações do hotel';

-- Criar índices para melhorar performance em queries que filtram por horário
CREATE INDEX IF NOT EXISTS idx_reservations_checkin_time ON public.reservations(checkin_time);
CREATE INDEX IF NOT EXISTS idx_reservations_checkout_time ON public.reservations(checkout_time);

