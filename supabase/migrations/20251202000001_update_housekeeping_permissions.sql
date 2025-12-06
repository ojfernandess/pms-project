-- Atualizar permissões da função Camareira (housekeeping)
-- Camareira não pode criar, mover ou cancelar reservas, apenas bloquear
UPDATE public.employee_roles
SET permissions = jsonb_build_object(
  'dashboard', false,
  'reservations', jsonb_build_object(
    'read', true,
    'create', false,
    'update', false,
    'delete', false,
    'block', true  -- Pode bloquear quartos
  ),
  'occupancy_map', jsonb_build_object(
    'read', true
  ),
  'maintenance', jsonb_build_object(
    'read', true,
    'create', true
  ),
  'clients', jsonb_build_object(
    'read', false
  ),
  'units', jsonb_build_object(
    'read', false
  ),
  'financial', false,
  'pricing', false,
  'channel_manager', false,
  'settings', false,
  'employees', false,
  'super_admin', false
)
WHERE code = 'housekeeping';

COMMENT ON COLUMN public.employee_roles.permissions IS 'Permissões específicas em formato JSON. Para camareira: apenas leitura de reservas e ocupação, pode bloquear quartos e criar tickets de manutenção.';

