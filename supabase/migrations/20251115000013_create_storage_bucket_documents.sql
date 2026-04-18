-- Criar bucket para documentos do web check-in
-- IMPORTANTE: Este script tenta criar o bucket, mas pode falhar por falta de permissões.
-- Se falhar, crie o bucket manualmente no Supabase Dashboard (veja APLICAR_MIGRATION_STORAGE_BUCKET.md)

-- Tentar criar o bucket (requer permissões de service_role)
-- Se este script falhar, crie o bucket manualmente no Supabase Dashboard
DO $$
BEGIN
    -- Verificar se o bucket existe
    IF NOT EXISTS (
        SELECT 1 FROM storage.buckets WHERE name = 'documents'
    ) THEN
        -- Criar bucket (requer permissões de superuser ou service_role)
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES (
            'documents',
            'documents',
            false, -- Bucket privado
            10485760, -- 10MB em bytes
            ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
        )
        ON CONFLICT (id) DO NOTHING;
        
        RAISE NOTICE 'Bucket "documents" criado com sucesso';
    ELSE
        RAISE NOTICE 'Bucket "documents" já existe';
    END IF;
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Permissões insuficientes para criar bucket. Crie manualmente no Dashboard.';
    WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao criar bucket: %. Crie manualmente no Dashboard.', SQLERRM;
END $$;

-- NOTA: As políticas de acesso devem ser criadas manualmente no Supabase Dashboard
-- devido a restrições de permissões na tabela storage.objects
-- Veja o arquivo APLICAR_MIGRATION_STORAGE_BUCKET.md para instruções detalhadas

