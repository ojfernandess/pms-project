-- Corrigir constraint UNIQUE para permitir múltiplas configurações do mesmo tipo por estabelecimento
-- e atualizar políticas RLS para filtrar por establishment_id

-- Remover constraint UNIQUE antiga em api_name
ALTER TABLE public.api_settings 
  DROP CONSTRAINT IF EXISTS api_settings_api_name_key;

-- Adicionar constraint UNIQUE composta (api_name, establishment_id)
-- Isso permite múltiplas configurações do mesmo tipo, mas uma por estabelecimento
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'api_settings_api_name_establishment_id_key'
  ) THEN
    ALTER TABLE public.api_settings 
      ADD CONSTRAINT api_settings_api_name_establishment_id_key 
      UNIQUE (api_name, establishment_id);
  END IF;
END $$;

-- Remover políticas RLS antigas (muito permissivas)
DROP POLICY IF EXISTS "Allow authenticated users to read api settings" ON public.api_settings;
DROP POLICY IF EXISTS "Allow authenticated users to manage api settings" ON public.api_settings;

-- Criar políticas RLS que filtram por establishment_id
-- Política para SELECT: usuários só veem configurações do seu estabelecimento
CREATE POLICY "Users can view api settings from their establishments"
  ON public.api_settings
  FOR SELECT
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- Política para INSERT: usuários só podem criar configurações para estabelecimentos onde trabalham
CREATE POLICY "Users can insert api settings for their establishments"
  ON public.api_settings
  FOR INSERT
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- Política para UPDATE: usuários só podem atualizar configurações do seu estabelecimento
CREATE POLICY "Users can update api settings from their establishments"
  ON public.api_settings
  FOR UPDATE
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- Política para DELETE: usuários só podem deletar configurações do seu estabelecimento
CREATE POLICY "Users can delete api settings from their establishments"
  ON public.api_settings
  FOR DELETE
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

