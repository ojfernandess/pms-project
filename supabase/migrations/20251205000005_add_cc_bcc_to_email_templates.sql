-- Adicionar campos CC e BCC aos templates de email
-- CC e BCC serão armazenados como TEXT (separados por vírgula) para facilitar edição
-- Serão convertidos para array ao processar o envio

ALTER TABLE public.email_templates 
ADD COLUMN IF NOT EXISTS cc_emails TEXT,
ADD COLUMN IF NOT EXISTS bcc_emails TEXT;

-- Comentários
COMMENT ON COLUMN public.email_templates.cc_emails IS 'Emails em cópia (CC), separados por vírgula. Ex: email1@exemplo.com, email2@exemplo.com';
COMMENT ON COLUMN public.email_templates.bcc_emails IS 'Emails em cópia oculta (BCC), separados por vírgula. Ex: email1@exemplo.com, email2@exemplo.com';

-- Adicionar campos CC e BCC na tabela email_queue também
ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS cc_emails TEXT,
ADD COLUMN IF NOT EXISTS bcc_emails TEXT;

-- Comentários
COMMENT ON COLUMN public.email_queue.cc_emails IS 'Emails em cópia (CC) para este email específico, separados por vírgula';
COMMENT ON COLUMN public.email_queue.bcc_emails IS 'Emails em cópia oculta (BCC) para este email específico, separados por vírgula';

