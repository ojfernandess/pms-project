-- Corrige 42P10 em upserts no rate_calendar (Postgres sem constraint da migration original).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'rate_calendar'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_rate_calendar_entry'
  ) THEN
    ALTER TABLE public.rate_calendar
      ADD CONSTRAINT unique_rate_calendar_entry
      UNIQUE (establishment_id, pricing_plan_id, category_id, date);
  END IF;
END $$;