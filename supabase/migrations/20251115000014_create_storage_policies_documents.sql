-- Políticas de acesso para o bucket "documents" do storage
-- IMPORTANTE: Este arquivo contém apenas as políticas SQL para referência
-- As políticas devem ser criadas via Supabase Dashboard > Storage > Policies
-- devido a restrições de permissões na tabela storage.objects

-- NOTA: Execute estas políticas manualmente no Supabase Dashboard:
-- 1. Vá para Storage > Policies
-- 2. Selecione o bucket "documents"
-- 3. Clique em "New Policy"
-- 4. Use as expressões SQL abaixo

-- ============================================
-- Política 1: Leitura Pública (SELECT)
-- ============================================
-- Policy name: Documents are viewable by anyone
-- Allowed operation: SELECT
-- Target roles: anon, authenticated (ou deixe vazio)
-- USING expression:
bucket_id = 'documents'

-- ============================================
-- Política 2: Upload Público (INSERT)
-- ============================================
-- Policy name: Documents are insertable by anyone
-- Allowed operation: INSERT
-- Target roles: anon, authenticated (ou deixe vazio)
-- WITH CHECK expression:
bucket_id = 'documents'

-- ============================================
-- Política 3: Atualização (UPDATE) - Opcional
-- ============================================
-- Policy name: Documents are updatable by authenticated users
-- Allowed operation: UPDATE
-- Target roles: authenticated
-- USING expression:
bucket_id = 'documents'
-- WITH CHECK expression:
bucket_id = 'documents'

-- ============================================
-- Política 4: Deleção (DELETE) - Opcional
-- ============================================
-- Policy name: Documents are deletable by authenticated users
-- Allowed operation: DELETE
-- Target roles: authenticated
-- USING expression:
bucket_id = 'documents'

