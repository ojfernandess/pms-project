-- Remove sequências literais "\n" / "\r\n" gravadas por engano no HTML dos templates.
-- (aparecem no e-mail como texto "\n" entre hotel_name, telefone, WhatsApp, etc.)

UPDATE public.email_templates
SET
  body_html = REPLACE(REPLACE(COALESCE(body_html, ''), '\r\n', E'\n'), '\n', E'\n'),
  body_text = CASE
    WHEN body_text IS NULL THEN NULL
    ELSE REPLACE(REPLACE(body_text, '\r\n', E'\n'), '\n', E'\n')
  END,
  footer_text = CASE
    WHEN footer_text IS NULL THEN NULL
    ELSE REPLACE(REPLACE(footer_text, '\r\n', E'\n'), '\n', E'\n')
  END,
  updated_at = NOW()
WHERE COALESCE(body_html, '') LIKE '%\n%'
   OR COALESCE(body_text, '') LIKE '%\n%'
   OR COALESCE(footer_text, '') LIKE '%\n%';

UPDATE public.establishment_email_templates
SET
  body_html = REPLACE(REPLACE(COALESCE(body_html, ''), '\r\n', E'\n'), '\n', E'\n'),
  body_text = CASE
    WHEN body_text IS NULL THEN NULL
    ELSE REPLACE(REPLACE(body_text, '\r\n', E'\n'), '\n', E'\n')
  END,
  footer_text = CASE
    WHEN footer_text IS NULL THEN NULL
    ELSE REPLACE(REPLACE(footer_text, '\r\n', E'\n'), '\n', E'\n')
  END,
  updated_at = NOW()
WHERE COALESCE(body_html, '') LIKE '%\n%'
   OR COALESCE(body_text, '') LIKE '%\n%'
   OR COALESCE(footer_text, '') LIKE '%\n%';
