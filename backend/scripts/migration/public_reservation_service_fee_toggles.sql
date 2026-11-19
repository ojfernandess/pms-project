-- Origem: supabase/migrations/20260328120000_public_reservation_service_fee_toggles.sql
-- Toggles na Página Pública de Reservas (empresa): taxa de limpeza e opção de estacionamento.
-- Aplicar: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/migration/public_reservation_service_fee_toggles.sql

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS public_reservation_cleaning_fee_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS public_reservation_parking_option_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.public_reservation_cleaning_fee_enabled IS
  'Quando true e taxa configurada no estabelecimento, a página/motor público soma taxa de limpeza ao total.';
COMMENT ON COLUMN public.companies.public_reservation_parking_option_enabled IS
  'Quando true e estacionamento configurado, o hóspede pode optar por incluir estacionamento no checkout público.';