-- Toggles na Página Pública de Reservas (empresa): exibir taxa de limpeza (obrigatória) e opção de estacionamento.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS public_reservation_cleaning_fee_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS public_reservation_parking_option_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.public_reservation_cleaning_fee_enabled IS
  'Quando true e taxa configurada no estabelecimento, a página/motor público soma taxa de limpeza ao total.';
COMMENT ON COLUMN public.companies.public_reservation_parking_option_enabled IS
  'Quando true e estacionamento configurado, o hóspede pode optar por incluir estacionamento no checkout público.';