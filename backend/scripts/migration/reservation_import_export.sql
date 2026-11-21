-- Import/Export de reservas: códigos de-para de outros PMS + tabela de jobs

ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS external_pms_code TEXT;

ALTER TABLE public.room_categories
  ADD COLUMN IF NOT EXISTS external_pms_code TEXT;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS external_pms_code TEXT;

ALTER TABLE public.pricing_plans
  ADD COLUMN IF NOT EXISTS external_pms_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_buildings_est_external_pms_code
  ON public.buildings (establishment_id, external_pms_code)
  WHERE external_pms_code IS NOT NULL AND establishment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_categories_est_external_pms_code
  ON public.room_categories (establishment_id, external_pms_code)
  WHERE external_pms_code IS NOT NULL AND establishment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_est_external_pms_code
  ON public.rooms (establishment_id, external_pms_code)
  WHERE external_pms_code IS NOT NULL AND establishment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_plans_est_external_pms_code
  ON public.pricing_plans (establishment_id, external_pms_code)
  WHERE external_pms_code IS NOT NULL AND establishment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reservation_import_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  created_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  batch_size INT NOT NULL DEFAULT 25,
  total INT NOT NULL DEFAULT 0,
  processed INT NOT NULL DEFAULT 0,
  created_count INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_import_jobs_establishment
  ON public.reservation_import_jobs (establishment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservation_import_jobs_status
  ON public.reservation_import_jobs (status);

GRANT SELECT, INSERT, UPDATE ON TABLE public.reservation_import_jobs TO authenticated, service_role;
