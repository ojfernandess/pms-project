-- Adicionar suporte a serviços em prédios
-- Tornar establishment_id opcional e adicionar building_id opcional
ALTER TABLE public.establishment_services
  ALTER COLUMN establishment_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE CASCADE;

-- Adicionar constraint para garantir que pelo menos um dos dois (establishment_id ou building_id) seja fornecido
ALTER TABLE public.establishment_services
  DROP CONSTRAINT IF EXISTS check_establishment_or_building;

ALTER TABLE public.establishment_services
  ADD CONSTRAINT check_establishment_or_building 
  CHECK (
    (establishment_id IS NOT NULL AND building_id IS NULL) OR 
    (establishment_id IS NULL AND building_id IS NOT NULL)
  );

-- Atualizar constraint UNIQUE para considerar building_id
-- Primeiro, tentar dropar a constraint antiga se existir
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'establishment_services_establishment_id_name_key'
  ) THEN
    ALTER TABLE public.establishment_services 
    DROP CONSTRAINT establishment_services_establishment_id_name_key;
  END IF;
END $$;

-- Criar índices para building_id
CREATE INDEX IF NOT EXISTS idx_establishment_services_building_id ON public.establishment_services(building_id);

-- Atualizar constraint UNIQUE para permitir nomes únicos por estabelecimento ou prédio
-- Usar índices parciais únicos para garantir unicidade
DROP INDEX IF EXISTS establishment_services_establishment_id_name_key;
DROP INDEX IF EXISTS establishment_services_building_id_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS establishment_services_establishment_id_name_key 
  ON public.establishment_services(establishment_id, name) 
  WHERE establishment_id IS NOT NULL AND building_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS establishment_services_building_id_name_key 
  ON public.establishment_services(building_id, name) 
  WHERE building_id IS NOT NULL AND establishment_id IS NULL;

-- Atualizar comentários
COMMENT ON COLUMN public.establishment_services.establishment_id IS 'ID do estabelecimento (opcional se building_id for fornecido)';
COMMENT ON COLUMN public.establishment_services.building_id IS 'ID do prédio (opcional se establishment_id for fornecido)';

-- Atualizar RLS policies para incluir building_id
DROP POLICY IF EXISTS "Allow authenticated users to read establishment services" ON public.establishment_services;
DROP POLICY IF EXISTS "Allow authenticated users to manage establishment services" ON public.establishment_services;

CREATE POLICY "Allow authenticated users to read establishment services"
  ON public.establishment_services FOR SELECT
  TO authenticated
  USING (
    establishment_id IN (SELECT id FROM public.establishments WHERE id = establishment_id) OR
    building_id IN (
      SELECT b.id FROM public.buildings b
      INNER JOIN public.establishments e ON b.establishment_id = e.id
      WHERE b.id = building_id
    )
  );

CREATE POLICY "Allow authenticated users to manage establishment services"
  ON public.establishment_services FOR ALL
  TO authenticated
  USING (
    establishment_id IN (SELECT id FROM public.establishments WHERE id = establishment_id) OR
    building_id IN (
      SELECT b.id FROM public.buildings b
      INNER JOIN public.establishments e ON b.establishment_id = e.id
      WHERE b.id = building_id
    )
  )
  WITH CHECK (
    establishment_id IN (SELECT id FROM public.establishments WHERE id = establishment_id) OR
    building_id IN (
      SELECT b.id FROM public.buildings b
      INNER JOIN public.establishments e ON b.establishment_id = e.id
      WHERE b.id = building_id
    )
  );

