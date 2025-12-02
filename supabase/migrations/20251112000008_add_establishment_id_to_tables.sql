-- Adicionar establishment_id às tabelas principais
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

ALTER TABLE public.reservations 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

ALTER TABLE public.clients 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL;

ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

ALTER TABLE public.maintenance_tickets 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

ALTER TABLE public.buildings 
  ADD COLUMN IF NOT EXISTS establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE;

-- Adicionar índices
CREATE INDEX IF NOT EXISTS idx_rooms_establishment_id ON public.rooms(establishment_id);
CREATE INDEX IF NOT EXISTS idx_room_categories_establishment_id ON public.room_categories(establishment_id);
CREATE INDEX IF NOT EXISTS idx_reservations_establishment_id ON public.reservations(establishment_id);
CREATE INDEX IF NOT EXISTS idx_clients_establishment_id ON public.clients(establishment_id);
CREATE INDEX IF NOT EXISTS idx_payments_establishment_id ON public.payments(establishment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_establishment_id ON public.maintenance_tickets(establishment_id);
CREATE INDEX IF NOT EXISTS idx_buildings_establishment_id ON public.buildings(establishment_id);

