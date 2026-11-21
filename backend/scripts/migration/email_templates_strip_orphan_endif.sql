-- Remove {{/if}} órfão no início de subject/body (bug de engine antigo com #if aninhado).
-- Não altera blocos Handlebars válidos no meio do HTML.

UPDATE public.email_templates
SET
  subject = TRIM(BOTH FROM REGEXP_REPLACE(COALESCE(subject, ''), '^\s*\{\{\/if\}\}\s*', '', 'g')),
  body_html = REGEXP_REPLACE(COALESCE(body_html, ''), '(^|\n)\s*\{\{\/if\}\}\s*(?=\n|$)', '\n', 'g'),
  updated_at = NOW()
WHERE COALESCE(subject, '') ~ '\{\{\/if\}\}'
   OR COALESCE(body_html, '') ~ '\{\{\/if\}\}';

UPDATE public.establishment_email_templates
SET
  subject = TRIM(BOTH FROM REGEXP_REPLACE(COALESCE(subject, ''), '^\s*\{\{\/if\}\}\s*', '', 'g')),
  body_html = REGEXP_REPLACE(COALESCE(body_html, ''), '(^|\n)\s*\{\{\/if\}\}\s*(?=\n|$)', '\n', 'g'),
  updated_at = NOW()
WHERE COALESCE(subject, '') ~ '\{\{\/if\}\}'
   OR COALESCE(body_html, '') ~ '\{\{\/if\}\}';
