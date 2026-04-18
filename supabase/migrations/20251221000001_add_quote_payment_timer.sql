-- Adicionar campo para timer de pagamento de orçamento
ALTER TABLE public.hotel_settings
ADD COLUMN IF NOT EXISTS quote_payment_timer_minutes INTEGER DEFAULT 30;

-- Comentário explicativo
COMMENT ON COLUMN public.hotel_settings.quote_payment_timer_minutes IS 'Tempo em minutos para o hóspede realizar o pagamento do orçamento. Após esse tempo, o orçamento será cancelado automaticamente.';

