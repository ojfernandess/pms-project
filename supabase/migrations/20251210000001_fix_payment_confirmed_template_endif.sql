-- Migration: Corrigir template de Pagamento Confirmado para remover {{/if}} literal
-- O problema estava na estrutura condicional aninhada com {{else}}
-- A correção garante que o processamento de condicionais remova corretamente todas as tags

-- Remover qualquer {{/if}} literal que apareça antes de "Estamos ansiosos para recebê-lo!"
UPDATE public.email_templates
SET body_html = REGEXP_REPLACE(
  body_html,
  '\{\{/if\}\}\s*<p style="margin:0;">Estamos ansiosos para recebê-lo!</p>',
  '<p style="margin:0;">Estamos ansiosos para recebê-lo!</p>',
  'g'
),
updated_at = NOW()
WHERE event_type = 'payment.confirmed'::email_event_type
AND body_html LIKE '%{{/if}}%Estamos ansiosos para recebê-lo!%';

-- Comentário
COMMENT ON COLUMN public.email_templates.body_html IS 'Template HTML do e-mail. Suporta variáveis {{variable}} e condicionais {{#if variable}}...{{else}}...{{/if}}';

