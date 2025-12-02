-- Criar role de Proprietário (Owner)
-- O proprietário tem acesso apenas ao mapa de reservas e somente aos quartos que pertencem a ele

-- Inserir role de Proprietário
INSERT INTO public.employee_roles (name, code, description, permissions) VALUES
  ('Proprietário', 'owner', 'Acesso apenas ao mapa de reservas, visualizando somente os quartos que pertencem ao proprietário', 
   '{"dashboard": false, "reservations": {"read": true}, "occupancy_map": {"read": true}, "clients": false, "units": false, "financial": false, "pricing": false, "maintenance": false, "channel_manager": false, "settings": false, "employees": false, "super_admin": false}')
ON CONFLICT (code) DO UPDATE
SET 
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions;

-- Comentário explicativo
COMMENT ON COLUMN public.employee_roles.permissions IS 'Permissões do cargo em formato JSONB. O proprietário tem acesso apenas ao mapa de reservas (read-only) e visualiza somente os quartos onde owner_user_id corresponde ao seu user_id';

