-- Adicionar campos para controlar exibição de informações na página de pagamento
ALTER TABLE public.stripe_establishment_config
  ADD COLUMN IF NOT EXISTS show_establishment_policies BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_refund_policy BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_legal_policies BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_contact_info BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_policy_text TEXT;

COMMENT ON COLUMN public.stripe_establishment_config.show_establishment_policies IS 'Exibir políticas do estabelecimento na página de pagamento';
COMMENT ON COLUMN public.stripe_establishment_config.show_refund_policy IS 'Exibir política de reembolsos e devoluções na página de pagamento';
COMMENT ON COLUMN public.stripe_establishment_config.show_legal_policies IS 'Exibir políticas jurídicas na página de pagamento';
COMMENT ON COLUMN public.stripe_establishment_config.show_contact_info IS 'Exibir dados de contato na página de pagamento';
COMMENT ON COLUMN public.stripe_establishment_config.refund_policy_text IS 'Texto da política de reembolsos e devoluções específica para Stripe';

