-- Criar tabela de configurações do site
CREATE TABLE IF NOT EXISTS public.site_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  favicon_url TEXT,
  logo_url TEXT,
  site_title TEXT DEFAULT 'Hotel PMS - Sistema de Gerenciamento Hoteleiro',
  site_description TEXT DEFAULT 'Sistema completo de gerenciamento hoteleiro com dashboard, reservas, ocupação e controle financeiro',
  meta_description TEXT DEFAULT 'Sistema completo de gerenciamento hoteleiro com dashboard, reservas, ocupação e controle financeiro',
  og_title TEXT DEFAULT 'Hotel PMS - Sistema de Gerenciamento Hoteleiro',
  og_description TEXT DEFAULT 'Sistema completo de gerenciamento hoteleiro com dashboard, reservas, ocupação e controle financeiro',
  og_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_settings_single_row CHECK (id = '00000000-0000-0000-0000-000000000001')
);

-- Inserir registro inicial
INSERT INTO public.site_settings (id, site_title, site_description, meta_description, og_title, og_description)
VALUES ('00000000-0000-0000-0000-000000000001', 
  'Hotel PMS - Sistema de Gerenciamento Hoteleiro',
  'Sistema completo de gerenciamento hoteleiro com dashboard, reservas, ocupação e controle financeiro',
  'Sistema completo de gerenciamento hoteleiro com dashboard, reservas, ocupação e controle financeiro',
  'Hotel PMS - Sistema de Gerenciamento Hoteleiro',
  'Sistema completo de gerenciamento hoteleiro com dashboard, reservas, ocupação e controle financeiro')
ON CONFLICT (id) DO NOTHING;

-- Criar função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_site_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para atualizar updated_at (se não existir)
DROP TRIGGER IF EXISTS update_site_settings_updated_at ON public.site_settings;
CREATE TRIGGER update_site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_site_settings_updated_at();

-- Habilitar RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas se existirem (para evitar conflitos)
DROP POLICY IF EXISTS "Super admins can read site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Site settings are publicly readable" ON public.site_settings;
DROP POLICY IF EXISTS "Super admins can insert site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Super admins can update site settings" ON public.site_settings;

-- Política: Leitura pública (todos podem ler as configurações do site)
CREATE POLICY "Site settings are publicly readable"
  ON public.site_settings
  FOR SELECT
  USING (true);

-- Política: Apenas super admins podem inserir
CREATE POLICY "Super admins can insert site settings"
  ON public.site_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.is_super_admin = true
    )
  );

-- Política: Apenas super admins podem atualizar
CREATE POLICY "Super admins can update site settings"
  ON public.site_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE admin_users.user_id = auth.uid()
      AND admin_users.is_super_admin = true
    )
  );

