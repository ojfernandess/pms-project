-- Preferências por usuário: último acesso e favoritos em estabelecimentos

CREATE TABLE IF NOT EXISTS public.user_establishment_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_establishment_prefs UNIQUE (user_id, establishment_id)
);

CREATE INDEX IF NOT EXISTS idx_user_establishment_prefs_user
  ON public.user_establishment_preferences (user_id);

CREATE INDEX IF NOT EXISTS idx_user_establishment_prefs_last_access
  ON public.user_establishment_preferences (user_id, last_accessed_at DESC NULLS LAST);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_establishment_preferences TO authenticated, service_role;

ALTER TABLE public.user_establishment_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_establishment_preferences'
      AND policyname = 'user_establishment_prefs_own_rows'
  ) THEN
    CREATE POLICY user_establishment_prefs_own_rows
      ON public.user_establishment_preferences
      FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;