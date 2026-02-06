-- Adicionar campo coupon_id à tabela reservations
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.discount_coupons(id) ON DELETE SET NULL;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_reservations_coupon_id ON public.reservations(coupon_id);

-- Comentário
COMMENT ON COLUMN public.reservations.coupon_id IS 'ID do cupom de desconto aplicado na reserva';

