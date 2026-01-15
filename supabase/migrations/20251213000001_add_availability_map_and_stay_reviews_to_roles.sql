-- Adicionar permissões de Mapa de Disponibilidades e Avaliações aos roles padrão

-- Atualizar role de Gerente
UPDATE public.employee_roles
SET permissions = permissions || '{"availability_map": true, "stay_reviews": true}'::jsonb
WHERE code = 'manager';

-- Atualizar role de Vendedor
UPDATE public.employee_roles
SET permissions = permissions || '{"availability_map": {"read": true}, "stay_reviews": {"read": true}}'::jsonb
WHERE code = 'sales';

-- Atualizar role de Financeiro
UPDATE public.employee_roles
SET permissions = permissions || '{"availability_map": {"read": true}, "stay_reviews": {"read": true}}'::jsonb
WHERE code = 'financial';

-- Atualizar role de Operador
UPDATE public.employee_roles
SET permissions = permissions || '{"availability_map": true, "stay_reviews": {"read": true}}'::jsonb
WHERE code = 'operator';

-- Atualizar role de Camareira
UPDATE public.employee_roles
SET permissions = permissions || '{"availability_map": {"read": true}, "stay_reviews": false}'::jsonb
WHERE code = 'housekeeping';

-- Atualizar role de Manutenção
UPDATE public.employee_roles
SET permissions = permissions || '{"availability_map": {"read": true}, "stay_reviews": false}'::jsonb
WHERE code = 'maintenance';

-- Atualizar role de Proprietário (se existir)
UPDATE public.employee_roles
SET permissions = permissions || '{"availability_map": {"read": true}, "stay_reviews": false}'::jsonb
WHERE code = 'owner';

-- Comentário explicativo
COMMENT ON COLUMN public.employee_roles.permissions IS 'Permissões do cargo em formato JSONB. Inclui: dashboard, reservations, clients, units, financial, pricing, maintenance, occupancy_map, availability_map, stay_reviews, channel_manager, settings, employees, super_admin';

