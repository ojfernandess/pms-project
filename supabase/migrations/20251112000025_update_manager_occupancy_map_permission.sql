-- Atualizar permissões do cargo de Gerente para incluir acesso ao mapa de ocupação
UPDATE public.employee_roles
SET permissions = jsonb_set(
  permissions,
  '{occupancy_map}',
  'true'::jsonb,
  true
)
WHERE code = 'manager'
AND (
  -- Atualizar se não tiver a permissão ou se for false
  permissions->>'occupancy_map' IS NULL 
  OR permissions->>'occupancy_map' = 'false'
  OR (permissions->'occupancy_map' IS NOT NULL AND jsonb_typeof(permissions->'occupancy_map') = 'object')
);

-- Garantir que o gerente tenha todas as permissões necessárias
-- Se o registro não existir, será criado pelo INSERT na migration inicial
-- Mas vamos garantir que tenha todas as permissões corretas
UPDATE public.employee_roles
SET permissions = '{
  "dashboard": true,
  "reservations": true,
  "clients": true,
  "units": true,
  "financial": true,
  "pricing": true,
  "maintenance": true,
  "channel_manager": true,
  "settings": true,
  "employees": true,
  "occupancy_map": true,
  "super_admin": false
}'::jsonb
WHERE code = 'manager';

-- Comentário explicativo
COMMENT ON COLUMN public.employee_roles.permissions IS 'Permissões do cargo em formato JSONB. O gerente tem acesso completo ao PMS, incluindo mapa de ocupação, exceto painel super admin';

