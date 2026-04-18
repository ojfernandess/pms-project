-- Adicionar permissão de Orçamentos aos roles padrão

-- Atualizar role de Gerente (acesso completo)
UPDATE public.employee_roles
SET permissions = permissions || '{"quotes": true}'::jsonb
WHERE code = 'manager';

-- Atualizar role de Vendedor (acesso completo para criar orçamentos)
UPDATE public.employee_roles
SET permissions = permissions || '{"quotes": {"create": true, "read": true, "update": true, "delete": false}}'::jsonb
WHERE code = 'sales';

-- Atualizar role de Financeiro (leitura e criação)
UPDATE public.employee_roles
SET permissions = permissions || '{"quotes": {"create": true, "read": true, "update": true, "delete": false}}'::jsonb
WHERE code = 'financial';

-- Atualizar role de Operador (acesso completo)
UPDATE public.employee_roles
SET permissions = permissions || '{"quotes": true}'::jsonb
WHERE code = 'operator';

-- Atualizar role de Camareira (sem acesso)
UPDATE public.employee_roles
SET permissions = permissions || '{"quotes": false}'::jsonb
WHERE code = 'housekeeping';

-- Atualizar role de Manutenção (sem acesso)
UPDATE public.employee_roles
SET permissions = permissions || '{"quotes": false}'::jsonb
WHERE code = 'maintenance';

-- Atualizar role de Proprietário (se existir) - leitura apenas
UPDATE public.employee_roles
SET permissions = permissions || '{"quotes": {"read": true}}'::jsonb
WHERE code = 'owner';

-- Comentário explicativo
COMMENT ON COLUMN public.employee_roles.permissions IS 'Permissões do cargo em formato JSONB. Inclui: dashboard, reservations, clients, units, financial, pricing, maintenance, occupancy_map, availability_map, stay_reviews, quotes, channel_manager, settings, employees, super_admin';

