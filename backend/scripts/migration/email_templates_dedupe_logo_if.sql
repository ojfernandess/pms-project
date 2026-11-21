-- Normaliza header de logo: dois {{#if}} sequenciais (logo_url + hotel_logo) sem {{else}}
-- viram um único bloco {{#if logo_url}}...{{/if}}.

UPDATE public.email_templates
SET
  body_html = REGEXP_REPLACE(
    body_html,
    '\{\{#if\s+logo_url\}\}([\s\S]*?)\{\{/if\}\}\s*\{\{#if\s+hotel_logo\}\}[\s\S]*?\{\{/if\}\}',
    E'{{#if logo_url}}\\1{{/if}}',
    'g'
  ),
  updated_at = NOW()
WHERE body_html ~ '\{\{#if\s+logo_url\}\}'
  AND body_html ~ '\{\{#if\s+hotel_logo\}\}'
  AND body_html !~ '\{\{#if\s+logo_url\}\}[\s\S]*?\{\{else\}\}';

UPDATE public.establishment_email_templates
SET
  body_html = REGEXP_REPLACE(
    body_html,
    '\{\{#if\s+logo_url\}\}([\s\S]*?)\{\{/if\}\}\s*\{\{#if\s+hotel_logo\}\}[\s\S]*?\{\{/if\}\}',
    E'{{#if logo_url}}\\1{{/if}}',
    'g'
  ),
  updated_at = NOW()
WHERE body_html IS NOT NULL
  AND body_html ~ '\{\{#if\s+logo_url\}\}'
  AND body_html ~ '\{\{#if\s+hotel_logo\}\}'
  AND body_html !~ '\{\{#if\s+logo_url\}\}[\s\S]*?\{\{else\}\}';
