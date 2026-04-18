-- Permitir acesso público à configuração do Stripe quando relacionada a um orçamento ou pagamento público
-- Isso é necessário para que a página pública de pagamento do orçamento possa funcionar

-- NOTA: A política "Public can view stripe config for payments" já existe na migration 20251123000007
-- Esta migration adiciona suporte adicional para quotes usando função SECURITY DEFINER para evitar recursão

-- Criar função auxiliar para verificar quotes públicos (SECURITY DEFINER para evitar recursão RLS)
CREATE OR REPLACE FUNCTION public.has_public_quote_for_stripe_config(est_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.quotes
    WHERE establishment_id = est_id
    AND (payment_intent_id IS NOT NULL OR payment_link IS NOT NULL)
    AND status IN ('pending', 'sent')
  );
END;
$$;

-- Verificar se a política já existe antes de criar
DO $$ 
BEGIN
  -- Remover política existente se houver (específica para quotes)
  DROP POLICY IF EXISTS "Public can read stripe config for quotes" ON public.stripe_establishment_config;
  
  -- Criar política para permitir acesso público à configuração do Stripe quando relacionada a um quote
  -- Usa função SECURITY DEFINER para evitar recursão RLS
  CREATE POLICY "Public can read stripe config for quotes"
    ON public.stripe_establishment_config FOR SELECT
    TO anon, authenticated
    USING (
      public.has_public_quote_for_stripe_config(establishment_id)
    );
END $$;

-- Comentários explicativos
COMMENT ON FUNCTION public.has_public_quote_for_stripe_config(UUID) IS 
'Verifica se há um quote público relacionado a um estabelecimento para configuração Stripe. Usa SECURITY DEFINER para evitar recursão RLS.';

COMMENT ON POLICY "Public can read stripe config for quotes" ON public.stripe_establishment_config IS 
'Permite acesso público (anon) à configuração do Stripe quando há um orçamento com payment_intent_id/payment_link. Complementa a política existente para stripe_payments.';

