-- Corrige 42P10: upsert ON CONFLICT exige UNIQUE (establishment_id, event_type).
-- Rode no Postgres de produção se a tabela existir sem a constraint da migration 20260824140000.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'establishment_email_templates'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'establishment_email_templates_unique_event'
  ) THEN
    ALTER TABLE public.establishment_email_templates
      ADD CONSTRAINT establishment_email_templates_unique_event
      UNIQUE (establishment_id, event_type);
  END IF;
END $$;