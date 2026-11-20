-- StayOS CRM — garantir permissões de role no Postgres (idempotente)
-- Corrige ambientes onde o DDL CRM subiu sem o bloco de employee_roles da fundação.

UPDATE public.employee_roles
SET permissions = permissions || '{
  "crm": true,
  "crm_contacts": {"create": true, "read": true, "update": true},
  "crm_deals": {"create": true, "read": true, "update": true},
  "crm_campaigns": {"create": true, "read": true, "update": true},
  "crm_automations": {"create": true, "read": true, "update": true},
  "crm_b2b": {"create": true, "read": true, "update": true},
  "crm_loyalty": {"create": true, "read": true, "update": true},
  "crm_reports": {"read": true}
}'::jsonb
WHERE code IN ('manager', 'operator', 'sales');

UPDATE public.employee_roles
SET permissions = permissions || '{
  "crm": {"read": true},
  "crm_contacts": {"read": true},
  "crm_deals": {"read": true},
  "crm_campaigns": {"read": true},
  "crm_automations": {"read": true},
  "crm_b2b": {"read": true},
  "crm_loyalty": {"read": true},
  "crm_reports": {"read": true}
}'::jsonb
WHERE code IN ('financial', 'owner');

UPDATE public.employee_roles
SET permissions = permissions || '{
  "crm": false,
  "crm_contacts": false,
  "crm_deals": false,
  "crm_campaigns": false,
  "crm_automations": false,
  "crm_b2b": false,
  "crm_loyalty": false,
  "crm_reports": false
}'::jsonb
WHERE code IN ('housekeeping', 'maintenance');
