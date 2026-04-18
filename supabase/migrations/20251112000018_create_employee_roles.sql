-- Tabela de Funções (Roles) dos Funcionários
CREATE TABLE IF NOT EXISTS public.employee_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE, -- 'manager', 'sales', 'financial', 'operator', 'housekeeping', 'maintenance'
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}', -- Permissões específicas em formato JSON
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de Funcionários (vinculada aos usuários)
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.employee_roles(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, establishment_id)
);

-- Inserir roles padrão
INSERT INTO public.employee_roles (name, code, description, permissions) VALUES
  ('Gerente', 'manager', 'Acesso completo ao PMS, exceto painel super admin', 
   '{"dashboard": true, "reservations": true, "clients": true, "units": true, "financial": true, "pricing": true, "maintenance": true, "channel_manager": true, "settings": true, "employees": true, "occupancy_map": true, "super_admin": false}'),
  ('Vendedor', 'sales', 'Criar reservas', 
   '{"dashboard": true, "reservations": {"create": true, "read": true, "update": false, "delete": false}, "clients": {"read": true, "create": true}, "units": {"read": true}, "occupancy_map": {"read": true}}'),
  ('Financeiro', 'financial', 'Acesso completo ao PMS, exceto painel super admin', 
   '{"dashboard": true, "reservations": {"read": true}, "clients": {"read": true}, "units": {"read": true}, "financial": true, "pricing": {"read": true}, "maintenance": {"read": true}, "channel_manager": {"read": true}, "settings": false, "occupancy_map": {"read": true}, "super_admin": false}'),
  ('Operador', 'operator', 'Criar, editar e movimentar reservas', 
   '{"dashboard": true, "reservations": {"create": true, "read": true, "update": true, "delete": false}, "clients": {"read": true, "create": true, "update": true}, "units": {"read": true}, "occupancy_map": true}'),
  ('Camareira', 'housekeeping', 'Visualizar mapa de reservas, mapa de ocupação e manutenção (somente leitura)', 
   '{"dashboard": false, "reservations": {"read": true}, "occupancy_map": {"read": true}, "maintenance": {"read": true, "create": true}}'),
  ('Manutenção', 'maintenance', 'Resolver tickets, visualizar mapa de ocupação e mapa de reservas', 
   '{"dashboard": false, "reservations": {"read": true}, "occupancy_map": {"read": true}, "maintenance": {"read": true, "update": true, "create": true}}')
ON CONFLICT (code) DO NOTHING;

-- Índices
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_establishment_id ON public.employees(establishment_id);
CREATE INDEX IF NOT EXISTS idx_employees_role_id ON public.employees(role_id);

-- Enable Row Level Security
ALTER TABLE public.employee_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- RLS Policies para employee_roles (todos podem ler)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'employee_roles' 
    AND policyname = 'Allow authenticated users to read employee roles'
  ) THEN
    CREATE POLICY "Allow authenticated users to read employee roles"
      ON public.employee_roles FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

-- RLS Policies para employees
-- Permitir que usuários leiam funcionários do seu estabelecimento
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'employees' 
    AND policyname = 'Allow users to read employees from their establishments'
  ) THEN
    CREATE POLICY "Allow users to read employees from their establishments"
      ON public.employees FOR SELECT
      TO authenticated
      USING (
        establishment_id IN (
          SELECT e.id FROM public.establishments e
          INNER JOIN public.user_companies uc ON uc.company_id = e.company_id
          WHERE uc.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Permitir que gerentes e super admins gerenciem funcionários
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'employees' 
    AND policyname = 'Allow managers to manage employees'
  ) THEN
    CREATE POLICY "Allow managers to manage employees"
      ON public.employees FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.employees emp
          INNER JOIN public.employee_roles er ON er.id = emp.role_id
          WHERE emp.user_id = auth.uid()
          AND emp.establishment_id = employees.establishment_id
          AND (er.code = 'manager' OR EXISTS (
            SELECT 1 FROM public.admin_users au
            WHERE au.user_id = auth.uid() AND au.is_super_admin = true
          ))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.employees emp
          INNER JOIN public.employee_roles er ON er.id = emp.role_id
          WHERE emp.user_id = auth.uid()
          AND emp.establishment_id = employees.establishment_id
          AND (er.code = 'manager' OR EXISTS (
            SELECT 1 FROM public.admin_users au
            WHERE au.user_id = auth.uid() AND au.is_super_admin = true
          ))
        )
      );
  END IF;
END $$;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_employee_roles_updated_at ON public.employee_roles;
CREATE TRIGGER update_employee_roles_updated_at
  BEFORE UPDATE ON public.employee_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_employees_updated_at ON public.employees;
CREATE TRIGGER update_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

