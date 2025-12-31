-- Migration: Corrigir template de Check-out Concluído para mostrar número do quarto
-- Adiciona fallback para room_name caso room_number não esteja disponível

UPDATE public.email_templates
SET body_html = REGEXP_REPLACE(
  body_html,
  '\{\{#if room_number\}\}\s*<p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Quarto:</strong> \{\{room_number\}\}</p>\s*\{\{/if\}\}',
  '{{#if room_number}}
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                {{else}}
                {{#if room_name}}
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Quarto:</strong> {{room_name}}</p>
                {{/if}}
                {{/if}}',
  'g'
),
updated_at = NOW()
WHERE event_type = 'checkout.completed'::email_event_type
AND body_html LIKE '%{{#if room_number}}%';

-- Comentário
COMMENT ON COLUMN public.email_templates.body_html IS 'Template HTML do e-mail. Suporta variáveis {{variable}} e condicionais {{#if variable}}...{{else}}...{{/if}}';

