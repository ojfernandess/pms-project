-- Permitir leitura pública (anon) da tabela hotel_settings para web check-in
-- Isso permite que hóspedes não autenticados vejam informações básicas do estabelecimento

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'hotel_settings' 
    AND policyname = 'Allow public read access to hotel settings'
  ) THEN
    CREATE POLICY "Allow public read access to hotel settings"
      ON public.hotel_settings FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

