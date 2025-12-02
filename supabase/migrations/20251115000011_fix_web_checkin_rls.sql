-- Script para corrigir políticas RLS do web_checkin
-- Execute este script se ainda estiver recebendo erro 406

-- IMPORTANTE: Este script remove TODAS as políticas existentes e recria com nomes mais simples

-- ============================================
-- WEB_CHECKIN
-- ============================================

-- Remover todas as políticas existentes de web_checkin
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'web_checkin') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.web_checkin';
    END LOOP;
END $$;

-- Criar políticas corretas para web_checkin
-- Política de leitura: permitir para todos
CREATE POLICY "web_checkin_select"
  ON public.web_checkin
  FOR SELECT
  USING (true);

-- Política de inserção: apenas autenticados
CREATE POLICY "web_checkin_insert"
  ON public.web_checkin
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Política de atualização: permitir para todos durante o processo
CREATE POLICY "web_checkin_update"
  ON public.web_checkin
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- WEB_CHECKIN_DOCUMENTS
-- ============================================

-- Remover todas as políticas existentes de web_checkin_documents
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'web_checkin_documents') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.web_checkin_documents';
    END LOOP;
END $$;

-- Criar políticas para web_checkin_documents
CREATE POLICY "web_checkin_documents_select"
  ON public.web_checkin_documents
  FOR SELECT
  USING (true);

CREATE POLICY "web_checkin_documents_insert"
  ON public.web_checkin_documents
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "web_checkin_documents_update"
  ON public.web_checkin_documents
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============================================
-- WEB_CHECKIN_GUESTS
-- ============================================

-- Remover todas as políticas existentes de web_checkin_guests
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'web_checkin_guests') 
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.web_checkin_guests';
    END LOOP;
END $$;

-- Criar políticas para web_checkin_guests
CREATE POLICY "web_checkin_guests_select"
  ON public.web_checkin_guests
  FOR SELECT
  USING (true);

CREATE POLICY "web_checkin_guests_insert"
  ON public.web_checkin_guests
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "web_checkin_guests_update"
  ON public.web_checkin_guests
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "web_checkin_guests_delete"
  ON public.web_checkin_guests
  FOR DELETE
  USING (true);

-- ============================================
-- Verificar políticas criadas
-- ============================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('web_checkin', 'web_checkin_documents', 'web_checkin_guests')
ORDER BY tablename, policyname;

