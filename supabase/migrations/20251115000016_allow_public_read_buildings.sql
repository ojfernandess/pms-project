-- Permitir leitura pública de buildings para web check-in
-- Isso permite que hóspedes vejam o endereço do prédio durante o check-in web

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'buildings' 
    AND policyname = 'Buildings are viewable by anyone for web check-in'
  ) THEN
    CREATE POLICY "Buildings are viewable by anyone for web check-in"
      ON public.buildings FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

