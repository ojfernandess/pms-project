-- Adicionar campo para e-mail do departamento que emite Nota Fiscal
ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS invoice_email TEXT;

-- Comentário explicativo
COMMENT ON COLUMN public.hotel_settings.invoice_email IS 'E-mail do departamento responsável por emitir Notas Fiscais. Quando um hóspede solicitar NF, a solicitação será enviada para este e-mail.';


