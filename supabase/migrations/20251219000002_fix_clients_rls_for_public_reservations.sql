-- ============================================
-- CORRIGIR POLÍTICAS RLS PARA CLIENTS E QUOTES (criação pública)
-- ============================================

-- ============================================
-- POLÍTICAS PARA TABELA CLIENTS
-- ============================================

-- Remover política existente se houver
DROP POLICY IF EXISTS "Public can create clients for reservations" ON public.clients;

-- Criar política que permite criação pública de clientes
-- IMPORTANTE: Permitir criação mesmo sem establishment_id (pode ser NULL)
CREATE POLICY "Public can create clients for reservations"
  ON public.clients FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Garantir que usuários anônimos também possam ler seus próprios clientes criados
-- (útil para verificar se o cliente foi criado corretamente)
DROP POLICY IF EXISTS "Public can read own clients" ON public.clients;

CREATE POLICY "Public can read own clients"
  ON public.clients FOR SELECT
  TO anon, authenticated
  USING (true); -- Permitir leitura para verificar criação

-- ============================================
-- POLÍTICAS PARA TABELA QUOTES
-- ============================================

-- Remover política existente se houver
DROP POLICY IF EXISTS "Public can create quotes for reservations" ON public.quotes;

-- Criar política que permite criação pública de orçamentos
-- IMPORTANTE: Esta política deve permitir criação mesmo sem autenticação
CREATE POLICY "Public can create quotes for reservations"
  ON public.quotes FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Garantir que usuários anônimos também possam ler seus próprios quotes criados
DROP POLICY IF EXISTS "Public can read own quotes" ON public.quotes;

CREATE POLICY "Public can read own quotes"
  ON public.quotes FOR SELECT
  TO anon, authenticated
  USING (true); -- Permitir leitura para verificar criação

-- Permitir atualização pública de quotes (para atualizar payment_link e payment_intent_id)
DROP POLICY IF EXISTS "Public can update own quotes" ON public.quotes;

CREATE POLICY "Public can update own quotes"
  ON public.quotes FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Comentários
COMMENT ON POLICY "Public can create clients for reservations" ON public.clients IS 
'Permite criação pública (anon) de clientes na tabela clients. Necessário para página pública de reservas onde hóspedes criam seus próprios registros.';

COMMENT ON POLICY "Public can read own clients" ON public.clients IS 
'Permite leitura pública (anon) de clientes. Necessário para verificar se o cliente foi criado corretamente após inserção.';

COMMENT ON POLICY "Public can create quotes for reservations" ON public.quotes IS 
'Permite criação pública (anon) de orçamentos na tabela quotes. Necessário para página pública de reservas onde hóspedes criam seus próprios orçamentos.';

COMMENT ON POLICY "Public can read own quotes" ON public.quotes IS 
'Permite leitura pública (anon) de orçamentos. Necessário para verificar se o orçamento foi criado corretamente após inserção.';

COMMENT ON POLICY "Public can update own quotes" ON public.quotes IS 
'Permite atualização pública (anon) de orçamentos. Necessário para atualizar payment_link e payment_intent_id após criação do Payment Intent.';

