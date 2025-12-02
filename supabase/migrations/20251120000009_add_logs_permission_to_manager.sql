-- Adicionar permissão "logs" para o cargo de Gerente
UPDATE public.employee_roles
SET permissions = jsonb_set(
  permissions,
  '{logs}',
  'true'::jsonb,
  true
)
WHERE code = 'manager'
AND (
  -- Atualizar se não tiver a permissão ou se for false
  permissions->>'logs' IS NULL 
  OR permissions->>'logs' = 'false'
);

-- Comentário explicativo
COMMENT ON COLUMN public.employee_roles.permissions IS 'Permissões do cargo em formato JSONB. O gerente tem acesso completo ao PMS, incluindo logs, exceto painel super admin';

