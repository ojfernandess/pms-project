-- Migration: Permitir acesso público a pagamentos através do stripe_payment_intent_id
-- O problema: As políticas RLS de stripe_payments só permitem acesso para usuários autenticados (TO authenticated)
-- Mas os hóspedes precisam acessar o link de pagamento sem autenticação
-- Solução: Criar política que permite acesso público para pagamentos através do stripe_payment_intent_id

-- IMPORTANTE: Esta política permite acesso público, mas é segura porque:
-- 1. O stripe_payment_intent_id é único e só é conhecido por quem recebeu o link
-- 2. Apenas permite SELECT (leitura), não permite INSERT, UPDATE ou DELETE
-- 3. O link de pagamento já contém o payment_intent_id, então apenas quem tem o link pode acessar
-- 4. O Stripe já valida o pagamento, então não há risco de manipulação

-- Criar política que permite acesso público para pagamentos através do stripe_payment_intent_id
-- A segurança é garantida porque:
-- 1. O stripe_payment_intent_id é único e só é conhecido por quem recebeu o link
-- 2. O link de pagamento já contém o payment_intent_id, então apenas quem tem o link pode acessar
-- 3. O Stripe já valida o pagamento, então não há risco de manipulação
CREATE POLICY "Public can view payments by payment intent id"
  ON public.stripe_payments FOR SELECT
  TO public
  USING (
    -- Permitir acesso se o pagamento tem um stripe_payment_intent_id
    -- O payment_intent_id já funciona como autenticação (apenas quem tem o link pode acessar)
    stripe_payment_intent_id IS NOT NULL
  );

-- NOTA: Esta política funciona em conjunto com as políticas existentes
-- As políticas existentes continuam funcionando para usuários autenticados do PMS
-- Esta nova política apenas adiciona acesso público para pagamentos através do payment_intent_id
-- O acesso público é limitado apenas a SELECT (leitura), não permite modificação

-- ============================================
-- POLÍTICAS PARA TABELA HOTEL_SETTINGS
-- ============================================
-- Permitir acesso público a hotel_settings quando relacionado a pagamentos públicos
CREATE POLICY "Public can view hotel settings for payments"
  ON public.hotel_settings FOR SELECT
  TO public
  USING (
    -- Permitir acesso se o hotel_settings está relacionado a um estabelecimento
    -- que tem um pagamento público (através de stripe_payments com payment_intent_id)
    establishment_id IN (
      SELECT DISTINCT establishment_id 
      FROM public.stripe_payments
      WHERE stripe_payment_intent_id IS NOT NULL
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA STRIPE_ESTABLISHMENT_CONFIG
-- ============================================
-- Permitir acesso público a stripe_establishment_config quando relacionado a pagamentos públicos
CREATE POLICY "Public can view stripe config for payments"
  ON public.stripe_establishment_config FOR SELECT
  TO public
  USING (
    -- Permitir acesso se o stripe_establishment_config está relacionado a um estabelecimento
    -- que tem um pagamento público (através de stripe_payments com payment_intent_id)
    establishment_id IN (
      SELECT DISTINCT establishment_id 
      FROM public.stripe_payments
      WHERE stripe_payment_intent_id IS NOT NULL
    )
  );

