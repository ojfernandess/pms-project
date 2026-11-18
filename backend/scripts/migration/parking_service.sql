-- Estacionamento: configuração em serviços, vagas no mapa e reserva vinculada (Postgres idempotente).
-- Aplicar: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/scripts/migration/parking_service.sql
-- O docker-entrypoint do backend também executa este ficheiro em cada arranque (se existir).

ALTER TABLE public.room_categories
  ADD COLUMN IF NOT EXISTS category_kind TEXT NOT NULL DEFAULT 'lodging';

COMMENT ON COLUMN public.room_categories.category_kind IS 'lodging | parking — categorias de estacionamento aparecem no mapa de reservas';

ALTER TABLE public.establishment_services
  ADD COLUMN IF NOT EXISTS parking_billing_mode TEXT,
  ADD COLUMN IF NOT EXISTS parking_spot_count INTEGER,
  ADD COLUMN IF NOT EXISTS parking_category_id UUID REFERENCES public.room_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.establishment_services.parking_billing_mode IS 'daily | period — cobrança por diária ou por período (service_kind parking_fee)';
COMMENT ON COLUMN public.establishment_services.parking_spot_count IS 'Quantidade de vagas sincronizadas no mapa';
COMMENT ON COLUMN public.establishment_services.parking_category_id IS 'Categoria (category_kind parking) com as vagas';

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS lodging_reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.reservations.lodging_reservation_id IS 'Reserva de vaga de estacionamento vinculada à hospedagem principal';

CREATE INDEX IF NOT EXISTS idx_reservations_lodging_reservation_id
  ON public.reservations(lodging_reservation_id)
  WHERE lodging_reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_room_categories_category_kind ON public.room_categories(category_kind);