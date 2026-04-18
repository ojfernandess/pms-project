-- Políticas de acesso para o bucket "maintenance" do storage
-- IMPORTANTE: Este arquivo contém apenas as políticas SQL para referência
-- As políticas devem ser criadas via Supabase Dashboard > Storage > Policies
-- devido a restrições de permissões na tabela storage.objects

-- NOTA: Execute estas políticas manualmente no Supabase Dashboard:
-- 1. Vá para Storage > Policies
-- 2. Selecione o bucket "maintenance"
-- 3. Clique em "New Policy"
-- 4. Use as expressões SQL abaixo

-- ============================================
-- Política 1: Leitura Pública (SELECT) - OBRIGATÓRIA
-- ============================================
-- Policy name: Maintenance images are viewable by anyone
-- Allowed operation: SELECT
-- Target roles: DEIXE VAZIO (permite anon e authenticated)
-- USING expression:
bucket_id = 'maintenance'

-- ============================================
-- Política 2: Upload Público (INSERT) - OBRIGATÓRIA
-- ============================================
-- Policy name: Maintenance images are insertable by anyone
-- Allowed operation: INSERT
-- Target roles: DEIXE VAZIO (permite anon e authenticated)
-- WITH CHECK expression:
bucket_id = 'maintenance'

-- ============================================
-- Política 3: Atualização (UPDATE) - Opcional
-- ============================================
-- Policy name: Maintenance images are updatable by authenticated users
-- Allowed operation: UPDATE
-- Target roles: authenticated
-- USING expression:
bucket_id = 'maintenance'
-- WITH CHECK expression:
bucket_id = 'maintenance'

-- ============================================
-- Política 4: Deleção (DELETE) - Opcional
-- ============================================
-- Policy name: Maintenance images are deletable by authenticated users
-- Allowed operation: DELETE
-- Target roles: authenticated
-- USING expression:
bucket_id = 'maintenance'

