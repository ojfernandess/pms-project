-- Origem: supabase/migrations/20261115190000_cleaning_fee_configuration.sql
-- Taxa de limpeza: colunas em establishment_services e service_fees (idempotente).

ALTER TABLE public.establishment_services
  ADD COLUMN IF NOT EXISTS service_kind TEXT NOT NULL DEFAULT 'amenity',
  ADD COLUMN IF NOT EXISTS default_amount NUMERIC(12, 2);

COMMENT ON COLUMN public.establishment_services.service_kind IS 'amenity | cleaning_fee';
COMMENT ON COLUMN public.establishment_services.default_amount IS 'Valor padrão (ex.: taxa de limpeza única)';

ALTER TABLE public.service_fees
  ADD COLUMN IF NOT EXISTS service_kind TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS default_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS source_service_id UUID REFERENCES public.establishment_services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.service_fees.service_kind IS 'custom | cleaning_fee';
COMMENT ON COLUMN public.service_fees.default_amount IS 'Valor sugerido ao lançar na reserva';
COMMENT ON COLUMN public.service_fees.source_service_id IS 'Serviço de origem (establishment_services)';
COMMENT ON COLUMN public.service_fees.building_id IS 'Quando a taxa é por prédio';

CREATE INDEX IF NOT EXISTS idx_service_fees_service_kind ON public.service_fees(service_kind);
CREATE INDEX IF NOT EXISTS idx_establishment_services_service_kind ON public.establishment_services(service_kind);