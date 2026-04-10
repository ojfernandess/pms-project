-- Fix Supabase linter warning: function_search_path_mutable (0011)
-- Applies a fixed search_path to all functions in schema public.
-- This reduces risk of search_path hijacking when function execution role changes.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions, pg_temp;',
      r.schema_name,
      r.function_name,
      r.identity_args
    );
  END LOOP;
END $$;

