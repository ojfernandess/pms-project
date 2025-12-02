-- Criar bucket para assets do hotel (logo, favicon, og_image)
-- IMPORTANTE: Este script tenta criar o bucket, mas pode falhar por falta de permissões.
-- Se falhar, crie o bucket manualmente no Supabase Dashboard

-- Tentar criar o bucket (requer permissões de service_role)
-- Se este script falhar, crie o bucket manualmente no Supabase Dashboard
DO $$
BEGIN
    -- Verificar se o bucket existe
    IF NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE name = 'hotel-assets'
    ) THEN
        -- Criar bucket (requer permissões de superuser ou service_role)
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'hotel-assets',
            'hotel-assets',
            true, -- Bucket público (necessário para logo, favicon, og_image)
            5242880, -- 5MB em bytes
            ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/x-icon']
        )
        ON CONFLICT (id) DO NOTHING;
        
        RAISE NOTICE 'Bucket "hotel-assets" criado com sucesso';
    ELSE
        RAISE NOTICE 'Bucket "hotel-assets" já existe';
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Permissões insuficientes para criar bucket. Crie manualmente no Dashboard.';
    WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao criar bucket: %. Crie manualmente no Dashboard.', SQLERRM;
END $$;

-- Criar políticas de acesso para o bucket hotel-assets
-- Como é um bucket público, permitir leitura para todos
DO $$
BEGIN
    -- Política de SELECT (leitura pública)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'hotel-assets public read'
    ) THEN
        CREATE POLICY "hotel-assets public read"
        ON storage.objects
        FOR SELECT
        USING (bucket_id = 'hotel-assets');
        
        RAISE NOTICE 'Política de leitura criada para hotel-assets';
    ELSE
        RAISE NOTICE 'Política de leitura já existe para hotel-assets';
    END IF;

    -- Política de INSERT (upload apenas para autenticados)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'hotel-assets authenticated insert'
    ) THEN
        CREATE POLICY "hotel-assets authenticated insert"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'hotel-assets');
        
        RAISE NOTICE 'Política de upload criada para hotel-assets';
    ELSE
        RAISE NOTICE 'Política de upload já existe para hotel-assets';
    END IF;

    -- Política de UPDATE (atualização apenas para autenticados)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'hotel-assets authenticated update'
    ) THEN
        CREATE POLICY "hotel-assets authenticated update"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (bucket_id = 'hotel-assets')
        WITH CHECK (bucket_id = 'hotel-assets');
        
        RAISE NOTICE 'Política de atualização criada para hotel-assets';
    ELSE
        RAISE NOTICE 'Política de atualização já existe para hotel-assets';
    END IF;

    -- Política de DELETE (exclusão apenas para autenticados)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects' 
        AND policyname = 'hotel-assets authenticated delete'
    ) THEN
        CREATE POLICY "hotel-assets authenticated delete"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (bucket_id = 'hotel-assets');
        
        RAISE NOTICE 'Política de exclusão criada para hotel-assets';
    ELSE
        RAISE NOTICE 'Política de exclusão já existe para hotel-assets';
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Permissões insuficientes para criar políticas. Configure manualmente no Dashboard.';
    WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao criar políticas: %. Configure manualmente no Dashboard.', SQLERRM;
END $$;

-- NOTA: Se as políticas não forem criadas automaticamente, configure-as manualmente no Supabase Dashboard:
-- 1. Vá para Storage > Policies
-- 2. Selecione o bucket "hotel-assets"
-- 3. Crie as seguintes políticas:
--    - SELECT: bucket_id = 'hotel-assets' (público)
--    - INSERT: bucket_id = 'hotel-assets' (authenticated)
--    - UPDATE: bucket_id = 'hotel-assets' (authenticated)
--    - DELETE: bucket_id = 'hotel-assets' (authenticated)

